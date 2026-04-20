module.exports = {
    apps: [
        {
            name: 'backend',
            script: 'dist/src/main.js',
            kill_timeout: 10000,
            env: {
                NODE_ENV: 'production',
                APP_ENV: 'prod',
                PORT: 3001
            }
        }
    ]
};
