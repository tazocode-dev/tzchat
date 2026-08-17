module.exports = {
  apps: [
    {
      name: 'tzchatback',
      cwd: __dirname,
      script: 'src/server.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      min_uptime: '10s',
      max_restarts: 5,
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
      kill_timeout: 10000,
      listen_timeout: 10000,
      time: true,
      merge_logs: true,
      env_production: {
        NODE_ENV: 'production',
        TZCHAT_PM2_ECOSYSTEM: '1',
      },
    },
  ],
};
