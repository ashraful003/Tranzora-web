import { NextResponse } from "next/server";
import {
  readDirectory,
  writeDirectory,
  readWorkspace,
  writeWorkspace,
  readBackups,
  writeBackups,
  serverLogin,
  serverRegister,
  freshState,
  isCloudStorage,
  DEMO_WS,
} from "@/lib/db/server-storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ws = searchParams.get("ws");

    if (ws) {
      const db = await readWorkspace(ws);
      const backups = await readBackups(ws);
      return NextResponse.json({
        success: true,
        workspace: ws,
        db,
        backups,
        isCloud: isCloudStorage(),
      });
    }

    const directory = await readDirectory();
    const demoDb = await readWorkspace(DEMO_WS);
    const demoBackups = await readBackups(DEMO_WS);

    return NextResponse.json({
      ready: true,
      isCloud: isCloudStorage(),
      storageMode: isCloudStorage() ? "cloud_kv" : "local_filesystem",
      directory,
      workspace: DEMO_WS,
      db: demoDb,
      backups: demoBackups,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Storage error";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    switch (action) {
      case "login": {
        const { email, password } = body;
        const result = await serverLogin(email, password);
        return NextResponse.json({ success: true, ...result });
      }

      case "register": {
        const { name, email, password, company } = body;
        const result = await serverRegister({ name, email, password, company });
        return NextResponse.json({ success: true, ...result });
      }

      case "commit": {
        const { workspace, db, directory } = body;
        if (workspace && db) await writeWorkspace(workspace, db);
        if (directory) await writeDirectory(directory);
        return NextResponse.json({ success: true });
      }

      case "backups": {
        const { workspace, backups } = body;
        if (workspace && backups) await writeBackups(workspace, backups);
        return NextResponse.json({ success: true });
      }

      case "reset_demo": {
        const fresh = freshState();
        await writeWorkspace(DEMO_WS, fresh);
        await writeBackups(DEMO_WS, []);
        return NextResponse.json({ success: true, db: fresh });
      }

      default:
        return NextResponse.json({ success: false, error: "Invalid action" }, { status: 400 });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Storage error";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
