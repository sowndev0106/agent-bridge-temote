#!/usr/bin/env node

import { randomUUID } from 'crypto';

let buffer = '';
let currentThreadId = 'thread_fake_1';
let currentTurnId = null;
let activeApprovalCallback = null;

function sendNotification(method, params) {
  const msg = {
    jsonrpc: '2.0',
    method,
    params
  };
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function sendResponse(id, result, error = null) {
  const msg = {
    jsonrpc: '2.0',
    id
  };
  if (error) {
    msg.error = error;
  } else {
    msg.result = result;
  }
  process.stdout.write(JSON.stringify(msg) + '\n');
}

// Process incoming lines from stdin
process.stdin.on('data', (chunk) => {
  buffer += chunk.toString();
  const lines = buffer.split('\n');
  buffer = lines.pop() ?? '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      handleLine(trimmed);
    }
  }
});

function handleLine(line) {
  try {
    const msg = JSON.parse(line);

    // Check if it is a JSON-RPC request (has 'method' and 'id')
    if ('method' in msg && 'id' in msg) {
      handleRequest(msg);
    } 
    // Check if it is a response to our approval request
    else if ('id' in msg && !('method' in msg)) {
      if (activeApprovalCallback && msg.id === 9999) {
        const decision = msg.result?.decision || 'rejected';
        activeApprovalCallback(decision);
        activeApprovalCallback = null;
      }
    }
  } catch (err) {
    // Ignore parse errors or malformed lines
  }
}

function handleRequest(req) {
  const { method, id, params } = req;

  if (method === 'initialize') {
    sendResponse(id, {
      codexHome: '/tmp/mock-codex-home',
      protocolVersion: 2
    });
  } 
  
  else if (method === 'thread/start') {
    currentThreadId = `thread_${randomUUID().slice(0, 8)}`;
    sendResponse(id, {
      thread: {
        id: currentThreadId,
        cwd: params?.cwd || '.'
      }
    });
  } 
  
  else if (method === 'thread/resume') {
    if (params?.threadId) {
      currentThreadId = params.threadId;
    }
    sendResponse(id, {
      thread: {
        id: currentThreadId,
        cwd: '.'
      }
    });
  } 
  
  else if (method === 'turn/start') {
    currentTurnId = `turn_${randomUUID().slice(0, 8)}`;
    
    // Respond to request immediately
    sendResponse(id, {
      turn: {
        id: currentTurnId,
        threadId: currentThreadId,
        status: 'running'
      }
    });

    // Extract input text
    let text = '';
    if (Array.isArray(params?.input)) {
      text = params.input[0]?.text || '';
    } else {
      text = String(params?.input || '');
    }

    // Start running turn asynchronously
    runTurnAsync(currentThreadId, currentTurnId, text);
  } 
  
  else if (method === 'turn/interrupt') {
    sendResponse(id, {});
    if (currentTurnId) {
      sendNotification('turn/completed', {
        threadId: currentThreadId,
        turnId: currentTurnId,
        status: 'interrupted'
      });
      currentTurnId = null;
    }
  } 
  
  else {
    sendResponse(id, null, {
      code: -32601,
      message: `Method not found: ${method}`
    });
  }
}

async function runTurnAsync(threadId, turnId, input) {
  // 1. Notify that the turn started
  sendNotification('turn/started', { threadId, turnId });
  await delay(100);

  // 2. Typewriter stream introduction
  const intro = `🤖 Hello! I am your Codex assistant running in interactive mock mode.\nI received your message: "${input}"\n\n`;
  await streamText(threadId, turnId, intro);

  // 3. Conditional approval check
  const lowerInput = input.toLowerCase();
  if (lowerInput.includes('approval') || lowerInput.includes('test') || lowerInput.includes('run')) {
    const askApprovalMsg = `I need your approval to execute a critical system test command.\n`;
    await streamText(threadId, turnId, askApprovalMsg);

    // Request approval from client (rpcId is 9999)
    sendNotification('item/approval/request', {
      threadId,
      turnId,
      approvalId: `app_${randomUUID().slice(0, 8)}`,
      command: 'npm run test',
      rpcId: 9999
    });

    // Wait for the frontend to resolve the approval
    const decision = await new Promise((resolve) => {
      activeApprovalCallback = resolve;
    });

    const approvalResultMsg = `\n✅ Thank you! You **${decision}** the approval request to run the command.\nContinuing turn execution...\n\n`;
    await streamText(threadId, turnId, approvalResultMsg);
  }

  // 4. Send final response paragraphs
  const finalMsg = `I have finished processing your request. Please let me know if there's anything else I can do to help you in this repository!`;
  await streamText(threadId, turnId, finalMsg);

  // 5. Complete the turn
  if (currentTurnId === turnId) {
    sendNotification('turn/completed', {
      threadId,
      turnId,
      status: 'completed'
    });
    currentTurnId = null;
  }
}

async function streamText(threadId, turnId, text, chunkSize = 15) {
  for (let i = 0; i < text.length; i += chunkSize) {
    if (currentTurnId !== turnId) break; // Interrupted
    const chunk = text.slice(i, i + chunkSize);
    sendNotification('item/agentMessage/delta', {
      threadId,
      turnId,
      delta: chunk
    });
    await delay(30);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Graceful exit handlers
const shutdown = () => {
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
