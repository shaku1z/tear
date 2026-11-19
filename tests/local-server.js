// Starts a browser test's server on a port the system picks free. Many worktrees run browser
// tests on one machine, so a fixed port collides ("listen EADDRINUSE"); callers read the
// origin back from here and never write a port number.
async function listenOnFreePort(server, host = "127.0.0.1") {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const { port } = server.address();
  return { port, origin: `http://${host}:${String(port)}` };
}

module.exports = { listenOnFreePort };
