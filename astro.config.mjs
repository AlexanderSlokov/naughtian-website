// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	integrations: [
		starlight({
			title: "Aleksandr Slokov's whitepapers",
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
