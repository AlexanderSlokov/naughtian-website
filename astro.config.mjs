// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

import remarkMath from 'remark-math';
import rehypeMathjax from 'rehype-mathjax';

/**
 * Build the sidebar group for one project in the ecosystem.
 *
 * Every project follows the same Diátaxis layout, so adding a new one is a
 * single call: create `src/content/docs/<dir>/` with an `index.mdx` plus any of
 * the four subdirectories, then add `project({ ... })` to the sidebar below.
 *
 * @param {object} options
 * @param {string} options.label   Display name, e.g. 'Kuberina'
 * @param {string} options.dir     Content directory under src/content/docs/
 * @param {string} [options.status] Optional badge text, e.g. 'Alpha'
 */
function project({ label, dir, status }) {
	/** @type {import('@astrojs/starlight/types').SidebarItem[]} */
	const sections = [{ label: 'Overview', link: `/${dir}/` }];

	// Diátaxis: learning / task / information / understanding oriented.
	for (const [heading, directory] of [
		['Tutorials', 'tutorials'],
		['How-to guides', 'how-to'],
		['Reference', 'reference'],
		['Explanation', 'explanation'],
	]) {
		sections.push({
			label: heading,
			items: [{ autogenerate: { directory: `${dir}/${directory}` } }],
		});
	}

	return {
		label,
		collapsed: true,
		...(status ? { badge: { text: status, variant: 'caution' } } : {}),
		items: sections,
	};
}

// https://astro.build/config
export default defineConfig({
	markdown: {
		remarkPlugins: [remarkMath],
		rehypePlugins: [rehypeMathjax],
	},
	integrations: [
		starlight({
			title: 'Naughtian',
			description:
				'An ecosystem of infrastructure tools for the 80% who never got a Kubernetes control plane: offline scheduling, pull-based delivery, and secret caching.',
			customCss: ['./src/styles/custom.css'],
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/AlexanderSlokov' },
			],
			editLink: {
				baseUrl: 'https://github.com/AlexanderSlokov/whitepapers/edit/main/',
			},
			sidebar: [
				{
					label: 'The ecosystem',
					items: [
						{ label: 'What is Naughtian?', link: '/ecosystem/overview/' },
						{ label: 'The stack', link: '/ecosystem/stack/' },
						{ label: 'Names and mythology', link: '/ecosystem/naming/' },
						{ label: 'Roadmap', link: '/ecosystem/roadmap/' },
					],
				},
				project({ label: 'Kuberina', dir: 'kuberina', status: 'Alpha' }),
				project({ label: 'Helvilette', dir: 'helvilette', status: 'Alpha' }),
				project({ label: 'Kallisto', dir: 'kallisto', status: 'Prototype' }),
				// Kalena, Kaeliir and Ginnungagap slot in here as they land.
				{
					label: 'Research',
					collapsed: true,
					items: [{ autogenerate: { directory: 'research' } }],
				},
			],
		}),
	],
});
