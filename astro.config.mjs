// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

import remarkMath from 'remark-math';
import rehypeMathjax from 'rehype-mathjax';

// https://astro.build/config
export default defineConfig({
	markdown: {
		remarkPlugins: [remarkMath],
		rehypePlugins: [rehypeMathjax],
	},
	integrations: [
		starlight({
			title: "Aleksandr Slokov's whitepapers",
			customCss: ['./src/styles/custom.css'],
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/AlexanderSlokov/whitepapers' }],
			sidebar: [
				{
					label: 'Whitepapers',
					items: [
						// Each item here is one entry in the navigation menu.
						{ label: 'Kuberina Paper', slug: 'naughtian_kuberina/paper' },
					],
				},
				{
					label: 'References',
					items: [{ autogenerate: { directory: 'references' } }],
				},
			],
		}),
	],
});
