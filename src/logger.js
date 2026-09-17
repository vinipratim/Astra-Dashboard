function log(level, fields, message) {
  const payload = {
    level,
    time: new Date().toISOString(),
    service: "astra-metrics",
    env: process.env.NODE_ENV || "development",
    ...fields,
    msg: message,
  };

  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

const logger = {
  info(fields, message) {
    log("info", fields, message);
  },
  warn(fields, message) {
    log("warn", fields, message);
  },
  error(fields, message) {
    log("error", fields, message);
  },
};

module.exports = { logger };
