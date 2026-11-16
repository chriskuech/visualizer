import { MIN_VERSIONS } from './copy';

export function renderUnsupported(root: HTMLElement, missing: readonly string[]): void {
  const main = document.createElement('main');
  main.className = 'unsupported';
  const h1 = document.createElement('h1');
  h1.textContent = 'This browser is not supported';
  const p = document.createElement('p');
  p.textContent = `Missing: ${missing.join(', ')}. Use a current desktop browser:`;
  const ul = document.createElement('ul');
  for (const v of MIN_VERSIONS) {
    const li = document.createElement('li');
    li.textContent = v;
    ul.append(li);
  }
  const https = document.createElement('p');
  https.textContent = 'The page must be served over HTTPS.';
  main.append(h1, p, ul, https);
  root.replaceChildren(main);
}
