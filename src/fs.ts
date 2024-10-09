import nfs from "node:fs";
import nfps from "node:fs/promises";
import npath from "node:path";

export async function del(path: string): Promise<void> {
	return new Promise(resolve =>
		nfs.rm(path, { recursive: true, force: true }, () => resolve())
	);
}

export async function isFile(path: string): Promise<boolean> {
	try {
		const stat = await nfps.stat(path);
		return stat.isFile();
	} catch (e) {
		return false;
	}
}

export async function emptyDir(dir: string): Promise<void> {
	const entries = await nfps.readdir(dir);
	for await (const entry of entries) {
		await del(npath.join(dir, entry));
	}
}

export const createDir = nfps.mkdir;
export const exists = nfps.exists;
export const writeFile = nfps.writeFile;
export const copyFile = nfps.copyFile;
export const readFile = nfps.readFile;
export const watch = nfs.watch;
