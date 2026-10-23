// I test girano con Node, senza bundler. Gli import del Worker non hanno l'estensione.
import { register } from 'node:module';

register(new URL('./loader.mjs', import.meta.url).href, { parentURL: import.meta.url });
