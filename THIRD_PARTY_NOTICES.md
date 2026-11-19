# Third-Party Notices

ScreenClip Pro incorporates the following open-source components. Each component
is licensed under its own terms, reproduced or referenced below. Nothing in the
LICENSE for ScreenClip Pro alters or supersedes these third-party licenses.

## Runtime Dependencies

| Package | Version | License | Source |
| --- | --- | --- | --- |
| react | ^19.2.1 | MIT | https://github.com/facebook/react |
| react-dom | ^19.2.1 | MIT | https://github.com/facebook/react |
| lucide-react | ^0.560.0 | ISC | https://github.com/lucide-icons/lucide |
| mp4-muxer | ^5.2.2 | MIT | https://github.com/Vanilagy/mp4-muxer |
| webm-muxer | ^5.1.4 | MIT | https://github.com/Vanilagy/webm-muxer |
| mediabunny | ^1.61.3 | MPL-2.0 | https://registry.npmjs.org/mediabunny/-/mediabunny-1.61.3.tgz |
| @mediabunny/mp3-encoder | 1.61.3 | MPL-2.0, with LGPL LAME encoder | https://registry.npmjs.org/@mediabunny/mp3-encoder/-/mp3-encoder-1.61.3.tgz |

## Build / Dev Dependencies

| Package | Version | License | Source |
| --- | --- | --- | --- |
| vite | ^6.2.0 | MIT | https://github.com/vitejs/vite |
| @vitejs/plugin-react | ^5.0.0 | MIT | https://github.com/vitejs/vite-plugin-react |
| vite-plugin-pwa | ^1.2.0 | MIT | https://github.com/vite-pwa/vite-plugin-pwa |
| tailwindcss | ^3.4.17 | MIT | https://github.com/tailwindlabs/tailwindcss |
| postcss | ^8.4.49 | MIT | https://github.com/postcss/postcss |
| autoprefixer | ^10.4.20 | MIT | https://github.com/postcss/autoprefixer |
| typescript | ~5.8.2 | Apache-2.0 | https://github.com/microsoft/TypeScript |
| @types/node | ^22.14.0 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react | ^19.2.7 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |
| @types/react-dom | ^19.2.3 | MIT | https://github.com/DefinitelyTyped/DefinitelyTyped |

## Removed Components

The following GPL/LGPL components were previously bundled and have been
**removed** from the runtime distribution:

- **FFmpeg.wasm** (LGPL / GPL with `-mt` build) — replaced with native WebCodecs
  API and `mp4-muxer`/`webm-muxer` (MIT) as of commit `562e118`.

## License Texts

### MIT License (covers all MIT-licensed components above)

```
Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### ISC License (lucide-react)

```
Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
```

### Apache License 2.0 (TypeScript)

See https://www.apache.org/licenses/LICENSE-2.0 for the full text.

### Mozilla Public License 2.0 (Mediabunny)

Mediabunny is used without source modifications. Its covered source is available at https://registry.npmjs.org/mediabunny/-/mediabunny-1.61.3.tgz and via the npm package `mediabunny@1.61.3`. A copy of its license is distributed as [`licenses/mediabunny-MPL-2.0.txt`](public/licenses/mediabunny-MPL-2.0.txt). ScreenClip application source retains its MIT license; Mediabunny retains MPL-2.0. The shipped source-availability notice is [`licenses/mediabunny-NOTICE.txt`](public/licenses/mediabunny-NOTICE.txt).

### Mediabunny MP3 extension and LAME

MP3 conversion loads the MP3 extension as a separate module. This extension is distributed with the [MPL 2.0 terms](public/licenses/mediabunny-MPL-2.0.txt), and includes the [LAME 3.100 MP3 encoder](https://lame.sourceforge.io/) under the [GNU Library General Public License v2](public/licenses/lame-LGPL-2.0.txt). See the [shipped MP3 encoder notice](public/licenses/mp3-encoder-NOTICE.txt) for the corresponding source and build instructions.
