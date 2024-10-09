#! /usr/bin/env bun

import path from "node:path";
import process from "node:process";
import os from "node:os";

import puppeteer from "puppeteer";
import esbuild from "esbuild";
import sveltePlugin from "esbuild-svelte";
import { sveltePreprocess } from "svelte-preprocess";
import * as fs from "./fs";

const svelteFilePath = process.argv[2];

if (!await fs.isFile(svelteFilePath)) {
	console.error("Given path is either invalid, or it does not point to a file");
	process.exit();
}

const tmpDir = os.tmpdir();
const outDir = path.join(tmpDir, ".render");

const relSvelteFilePath = path.relative(outDir, svelteFilePath).replaceAll("\\", "/");

if (await fs.exists(outDir)) {
	await fs.emptyDir(outDir);
} else {
	await fs.createDir(outDir);
}

const entryPoint = `
	import App from "${relSvelteFilePath}";

	const app = new App({
		target: document.getElementById("app")
	});

	export default app;
`;

await fs.writeFile(path.join(outDir, "entry.js"), entryPoint, { encoding: "utf-8" });
await fs.copyFile(path.join(import.meta.dir, "..", "res", "svelte.svg"), path.join(outDir, "svelte.svg"));

async function compile(): Promise<string | null> {
	try {
		await esbuild.build({
			entryPoints: [path.join(outDir, "entry.js")],
			bundle: true,
			outfile: path.join(outDir, "out.js"),
			minify: false,
			format: "esm",
			sourcemap: false,
			plugins: [
				sveltePlugin({
					compilerOptions: {
						css: "injected"
					},
					preprocess: sveltePreprocess()
				})
			]
		});
	} catch (e) {
		return null;
	}

	const jsCode = await fs.readFile(path.join(outDir, "out.js"), { encoding: "utf-8" });

	return `
		<!DOCTYPE html>
		<html>
			<head>
				<title>Preview</title>
				<link rel="icon" type="image/svg" href="./svelte.svg">
				<script type="module" defer>${jsCode}</script>
			</head>
			<body>
				<div id="app"></div>
			</body>
		</html>
	`;
}

const initialHtml = await compile();
if (!initialHtml) {
	console.error("Failed to compile given file");
	process.exit();
}

await fs.writeFile(path.join(outDir, "index.html"), initialHtml, { encoding: "utf-8" });

const browser = await puppeteer.launch({
	headless: false,
	args: [
		"--app=file:///" + path.resolve(path.join(outDir, "index.html")),
		"--disable-web-security",
		"--allow-file-access-from-files",
		"--window-size=640,480"
	]
});

const pages = await browser.pages();
const page = pages[0];

await page.setViewport(null);

function isCodeFile(fileName: string): boolean {
	return fileName.endsWith(".svelte")
		|| fileName.endsWith(".css")
		|| fileName.endsWith(".scss")
		|| fileName.endsWith(".sass")
		|| fileName.endsWith(".js")
		|| fileName.endsWith(".ts");
}

let compiling = false;

const watcher = fs.watch("", { recursive: true }, async (_, filePath) => {
	if (!compiling && filePath && !filePath.startsWith("\\.") && isCodeFile(filePath)) {
		// Make sure that we are not compiling multiple times at the same time
		compiling = true;
		const html = await compile();
		if (html !== null) {
			await fs.writeFile(path.join(outDir, "index.html"), html, { encoding: "utf-8" });
			await page.reload();
		}
		compiling = false;
	}
});

process.on("exit", () => {
	watcher.close();
	
	if (browser.connected) {
		browser.close();
	}
});

browser.on("disconnected", () => {
	watcher.close();
});
