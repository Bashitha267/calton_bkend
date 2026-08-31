// PM2 Ecosystem Config — Hostinger Node.js Hosting
module.exports = {
  apps: [
    {
      name: 'carlton-valley-api',
      script: 'src/index.js',
      instances: 1, // Hostinger shared: keep at 1 unless they allow cluster
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '256M', // restart if memory exceeds 256MB (shared hosting limit)
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true,
      autorestart: true,
      restart_delay: 5000,
      exp_backoff_restart_delay: 100,
    },
  ],
};
