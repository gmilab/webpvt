module.exports = {
    apps: [{
        name: "webpvt-server",
        script: "./server.js",
        env_production: {
            NODE_ENV: "production"
        },
    }]
};
