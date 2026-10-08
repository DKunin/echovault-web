module.exports = {
  apps: [
    {
      name: "echo-vault-web",
      script: "build-server/index.js",
      cwd: __dirname,
      node_args: "--env-file=.env.runtime",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
