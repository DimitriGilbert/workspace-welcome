const SITE_URL = "https://welcome-workspace.dbuild.dev";
const SITE_NAME = "welcome-workspace";
const OG_IMAGE_PATH = "/dashboard.png";

type SeoHeadOptions = {
	title: string;
	description: string;
	path: string;
};

export function seoHead({ title, description, path }: SeoHeadOptions) {
	const url = `${SITE_URL}${path}`;
	const ogImage = `${SITE_URL}${OG_IMAGE_PATH}`;

	return () => ({
		meta: [
			{ title },
			{ name: "description", content: description },
			{ property: "og:title", content: title },
			{ property: "og:description", content: description },
			{ property: "og:type", content: "website" },
			{ property: "og:site_name", content: SITE_NAME },
			{ property: "og:url", content: url },
			{ property: "og:image", content: ogImage },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "twitter:title", content: title },
			{ name: "twitter:description", content: description },
			{ name: "twitter:image", content: ogImage },
		],
		links: [{ rel: "canonical", href: url }],
	});
}
