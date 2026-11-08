# Third-party software

PRAHAR uses React and React DOM (MIT), lucide-react (ISC, with its retained
upstream icon notices), and highs-js/HiGHS (MIT). The build copies their supplied
license notices to `dist/licenses/` and `dist/solver/LICENSE.txt`. Dependency
versions are pinned in `package.json` and `pnpm-lock.yaml`.

- React: https://github.com/facebook/react
- Lucide: https://github.com/lucide-icons/lucide
- highs-js: https://github.com/lovasoa/highs-js
- HiGHS: https://github.com/ERGO-Code/HiGHS

Vite, TypeScript and the React Vite plugin are development tools. Their license
notices remain available with the installed packages. The optional Python
reference uses NumPy and SciPy; see `reference/requirements.txt`.

These upstream licenses do not grant a blanket license to PRAHAR's authored
application code, name, competition materials, or imported factory data.
