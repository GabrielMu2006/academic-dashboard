import { requestUrl, type App } from 'obsidian';
import {
	GITHUB_GRAPHQL_ENDPOINT,
	type GithubGraphqlPort,
	type GithubSecretPort,
} from '../core/github-contributions';

export function createObsidianGithubSecretPort(app: App): GithubSecretPort {
	return {
		getSecret: (id) => app.secretStorage.getSecret(id),
		setSecret: (id, value) => app.secretStorage.setSecret(id, value),
		listSecretIds: () => Object.freeze([...app.secretStorage.listSecrets()]),
	};
}

export function createObsidianGithubGraphqlPort(): GithubGraphqlPort {
	return {
		postViewerContributions: async (token, body) => {
			const response = await requestUrl({
				url: GITHUB_GRAPHQL_ENDPOINT,
				method: 'POST',
				contentType: 'application/json',
				headers: Object.freeze({
					Accept: 'application/vnd.github+json',
					Authorization: `Bearer ${token}`,
				}),
				body: JSON.stringify(body),
				throw: false,
			});
			return Object.freeze({ status: response.status, json: response.json as unknown });
		},
	};
}
