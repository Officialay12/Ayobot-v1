module.exports = {
  apps: [
    {
      name: "AYOBOT",
      script: "index.js",
      node_args: "--max-old-space-size=512",
      watch: false,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: 10000,
      exp_backoff_restart_delay: 100,
      env: {
        NODE_ENV: "production",
      },
      error_file: "logs/err.log",
      out_file: "logs/out.log",
      log_file: "logs/combined.log",
      time: true,
    },
  ],
};
