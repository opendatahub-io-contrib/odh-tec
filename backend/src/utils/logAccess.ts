import { FastifyRequest, FastifyBaseLogger } from 'fastify';
import * as fs from 'fs';
import { open } from 'fs/promises';
import * as path from 'path';
import { LOG_DIR } from './constants';

async function readLastLine(filePath: string): Promise<string> {
  const fileHandle = await open(filePath, 'r');
  const stat = await fileHandle.stat();
  const fileSize = stat.size;
  const bufferSize = 1024;
  let position = fileSize;
  let lastLine = '';
  let foundLineBreak = false;
  const chunks: string[] = [];

  while (position > 0 && !foundLineBreak) {
    const readSize = Math.min(bufferSize, position);
    position -= readSize;
    const buffer = new Uint8Array(readSize);
    await fileHandle.read(buffer, 0, readSize, position);
    const chunk = new TextDecoder('utf-8').decode(buffer);
    chunks.unshift(chunk);

    const joined = chunks.join('');

    // Split by newlines and find the last non-empty line
    const lines = joined.split('\n');

    // Look for the last non-empty line from the end
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (line.length > 0) {
        lastLine = line;
        foundLineBreak = true;
        break;
      }
    }

    // If we haven't found a non-empty line and we're not at the beginning, continue
    if (!foundLineBreak && position === 0) {
      // We've read the entire file and found no non-empty lines
      break;
    }
  }

  await fileHandle.close();
  return lastLine;
}

export const logAccess = (req: FastifyRequest): void => {
  const logEntry = {
    id: 'odh-tec',
    name: 'odh-tec',
    last_activity: new Date().toISOString(),
    execution_state: 'busy',
    connections: 1,
    path: req.raw.url,
    method: req.method,
  };
  const logFilePath = path.join(LOG_DIR, 'access.log');
  fs.appendFileSync(logFilePath, JSON.stringify(logEntry) + '\n');
};

export const getLastAccessLogEntry = async (logger?: FastifyBaseLogger): Promise<any> => {
  const logFilePath = path.join(LOG_DIR, 'access.log');

  try {
    if (!fs.existsSync(logFilePath)) {
      // Return default data if log file doesn't exist
      return [
        {
          id: 'odh-tec',
          name: 'odh-tec',
          last_activity: new Date().toISOString(),
          execution_state: 'alive',
          connections: 1,
        },
      ];
    }

    return readLastLine(logFilePath).then((lastLine) => {
      if (!lastLine || lastLine.trim().length === 0) {
        // Return default data if log file is empty
        return [
          {
            id: 'odh-tec',
            name: 'odh-tec',
            last_activity: new Date().toISOString(),
            execution_state: 'alive',
            connections: 1,
          },
        ];
      }

      // Parse the last line as JSON
      const lastEntry = JSON.parse(lastLine);

      // Check if last_activity is older than 10 minutes
      if (lastEntry.last_activity) {
        const lastActivityTime = new Date(lastEntry.last_activity);
        const currentTime = new Date();
        const timeDifferenceMs = currentTime.getTime() - lastActivityTime.getTime();
        const tenMinutesMs = 10 * 60 * 1000; // 10 minutes in milliseconds

        if (timeDifferenceMs > tenMinutesMs) {
          lastEntry.execution_state = 'idle';
        }
      }

      // Return as an array to match the expected format
      return [lastEntry];
    });
  } catch (error) {
    // Use Fastify logger if available, otherwise fall back to console.error
    if (logger && typeof logger.error === 'function') {
      logger.error(error, 'Error reading access log');
    } else {
      console.error('Error reading access log:', error);
    }
    // Return default data on error
    return [
      {
        id: 'odh-tec',
        name: 'odh-tec',
        last_activity: new Date().toISOString(),
        execution_state: 'alive',
        connections: 1,
      },
    ];
  }
};
