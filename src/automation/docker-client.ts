import { request } from "node:http";
import { existsSync } from "node:fs";

// Auftragspunkt "RESTART_CONTAINER" (Phase 11, Teil 2). Bewusst KEIN
// Shell-Aufruf (kein `docker restart <name>` per child_process/exec - das
// waere abhaengig von Shell-Quoting und damit ein Injection-Risiko) -
// stattdessen ein direkter HTTP-Request an die Docker Engine API ueber den
// (falls gemounteten) Unix-Socket. Der Zielcontainer ist ausschliesslich
// ueber die Umgebungsvariable DOCKER_SELF_CONTAINER_NAME konfigurierbar,
// NIEMALS aus einem Request-Body - es gibt also kein vom Client
// beeinflussbares "welcher Container" (Whitelisting).
const DOCKER_SOCKET_PATH = "/var/run/docker.sock";

export function isDockerSocketAvailable(): boolean {
  return existsSync(DOCKER_SOCKET_PATH);
}

export function resolveWhitelistedContainerName(): string | undefined {
  const name = process.env.DOCKER_SELF_CONTAINER_NAME;
  return name && name.trim().length > 0 ? name.trim() : undefined;
}

// Docker Engine API: POST /containers/{name}/restart. Der Containername
// wird ausschliesslich als URL-Pfadsegment via encodeURIComponent verwendet,
// nie in einen Shell-String eingebettet.
export async function restartContainerViaDockerSocket(containerName: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const req = request(
      {
        socketPath: DOCKER_SOCKET_PATH,
        path: `/containers/${encodeURIComponent(containerName)}/restart?t=10`,
        method: "POST",
        timeout: 15_000,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status >= 200 && status < 300) {
            resolve();
            return;
          }
          const body = Buffer.concat(chunks).toString("utf-8");
          reject(new Error(`Docker Engine API antwortete mit Status ${status}: ${body || "(leer)"}`));
        });
      },
    );
    req.on("timeout", () => req.destroy(new Error("Docker Engine API Zeitueberschreitung")));
    req.on("error", reject);
    req.end();
  });
}
