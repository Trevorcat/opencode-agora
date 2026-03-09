export const logger = {
  info: (msg: string, ...args: unknown[]) =>
    process.stderr.write(`[agora:info] ${msg}${args.length ? " " + JSON.stringify(args) : ""}\n`),
  error: (msg: string, ...args: unknown[]) =>
    process.stderr.write(`[agora:error] ${msg}${args.length ? " " + JSON.stringify(args) : ""}\n`),
  debug: (msg: string, ...args: unknown[]) => {
    if (process.env.AGORA_DEBUG) {
      process.stderr.write(`[agora:debug] ${msg}${args.length ? " " + JSON.stringify(args) : ""}\n`);
    }
  },
};
