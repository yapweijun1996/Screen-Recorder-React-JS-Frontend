import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const workflow = await readFile('.github/workflows/deploy.yml', 'utf8');
const viteConfig = await readFile('vite.config.ts', 'utf8');
const index = await readFile('index.html', 'utf8');
const pngAssets = [
    ['public/icons/icon-192.png', 192],
    ['public/icons/icon-512.png', 512],
    ['public/icons/maskable-icon-512.png', 512],
    ['public/icons/apple-touch-icon.png', 180],
];

test('Pages verifies pull requests and publishes only a verified main build', () => {
    assert.match(workflow, /pull_request:\s*\n\s+branches: \[main\]/);
    assert.match(workflow, /run: npm run typecheck/);
    assert.match(workflow, /run: npm test/);
    assert.match(workflow, /run: npm run build/);
    assert.match(workflow, /name: screenclip-dist/);
    assert.match(workflow, /needs: verify/);
    assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
    const globalPermissions = workflow.match(/^permissions:\n(?:  .*\n)+/m)?.[0] ?? '';
    assert.doesNotMatch(globalPermissions, /pages:|id-token:/);
    assert.match(workflow, /pages: write/);
    assert.match(workflow, /id-token: write/);
});

test('PWA assets remain relative to the configured GitHub Pages base path', () => {
    assert.match(viteConfig, /const base = '\.\/'/);
    assert.match(viteConfig, /id: base/);
    assert.match(viteConfig, /icons\/icon-192\.png/);
    assert.match(viteConfig, /icons\/icon-512\.png/);
    assert.match(viteConfig, /icons\/maskable-icon-512\.png/);
    assert.match(index, /apple-touch-icon.*icons\/apple-touch-icon\.png/);
});

test('PWA raster assets have the declared PNG dimensions', async () => {
    for (const [assetPath, size] of pngAssets) {
        const bytes = await readFile(assetPath);
        assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', assetPath);
        assert.equal(bytes.readUInt32BE(16), size, `${assetPath} width`);
        assert.equal(bytes.readUInt32BE(20), size, `${assetPath} height`);
    }
});
