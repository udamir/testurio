import pc from 'picocolors';
import type { Logger } from '../generators/types.js';

export interface LoggerOptions {
  quiet?: boolean;
  verbose?: boolean;
  prefix?: string;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const { quiet = false, verbose = false, prefix } = options;

  function formatMessage(message: string): string {
    return prefix ? `[${prefix}] ${message}` : message;
  }

  return {
    info(message: string) {
      if (!quiet) {
        console.log(formatMessage(message));
      }
    },

    success(message: string) {
      if (!quiet) {
        console.log(pc.green(formatMessage(`${message}`)));
      }
    },

    warn(message: string) {
      if (!quiet) {
        console.warn(pc.yellow(formatMessage(`warn: ${message}`)));
      }
    },

    error(message: string) {
      console.error(pc.red(formatMessage(`error: ${message}`)));
    },

    debug(message: string) {
      if (verbose && !quiet) {
        console.log(pc.gray(formatMessage(message)));
      }
    },
  };
}
