import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Define the parameter types to match the zod schema
type WeeklyReportParams = {
  username: string;
  offset?: number;
  repos?: string[];
  generateSummary?: boolean;
  organization?: string;
  startDate?: string;
  endDate?: string;
};

// Interfaces for GitHub API responses
interface GitHubPR {
  title: string;
  number: number;
  createdAt: string;
  repo: string;
}

interface GitHubCommit {
  commit: {
    author: {
      date: string;
    };
    message: string;
  };
  repo: string;
}

interface GitHubGraphQLResponse<T> {
  data: T;
  errors?: Array<{
    message: string;
    locations?: Array<{ line: number; column: number }>;
    path?: string[];
  }>;
}

interface GitHubGraphQLVariables {
  [key: string]: string | number | boolean | null;
}

interface GitHubRESTCommitResponse {
  items: Array<{
    commit: {
      author: {
        date: string;
      };
      message: string;
    };
    repository: {
      full_name: string;
    };
  }>;
}

interface GitHubGraphQLNode {
  title?: string;
  number?: number;
  createdAt?: string;
  repository?: {
    name: string;
    nameWithOwner?: string;
    full_name?: string;
  };
}

interface GitHubGraphQLPageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}

interface GitHubGraphQLSearchResponse {
  search: {
    nodes: GitHubGraphQLNode[];
    pageInfo: GitHubGraphQLPageInfo;
  };
}

interface GitHubGraphQLUserResponse {
  user: {
    repositories: {
      nodes: Array<{
        name: string;
        nameWithOwner: string;
      }>;
      pageInfo: GitHubGraphQLPageInfo;
    };
  };
}

interface GitHubGraphQLViewerResponse {
  viewer: {
    login: string;
  };
}

// Makes a minimal GraphQL request to GitHub for PR searching
async function makeGitHubGraphQLRequest<T>(
  token: string,
  query: string,
  variables: GitHubGraphQLVariables = {},
  retryCount = 0,
  maxRetries = 3,
): Promise<GitHubGraphQLResponse<T>> {
  const url = 'https://api.github.com/graphql';
  try {
    console.log(`Making GitHub GraphQL request: ${JSON.stringify(variables)}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github.v4+json',
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });

    // Log rate limit information
    const rateLimit = {
      limit: response.headers.get('X-RateLimit-Limit') || 'unknown',
      remaining: response.headers.get('X-RateLimit-Remaining') || 'unknown',
      reset: response.headers.get('X-RateLimit-Reset')
        ? new Date(Number(response.headers.get('X-RateLimit-Reset')) * 1000).toLocaleString()
        : 'unknown',
      resetSeconds: response.headers.get('X-RateLimit-Reset')
        ? Number(response.headers.get('X-RateLimit-Reset')) - Math.floor(Date.now() / 1000)
        : 0,
    };
    console.log(
      `GitHub API rate limit: ${rateLimit.remaining}/${rateLimit.limit}, resets at ${rateLimit.reset} (in ${rateLimit.resetSeconds} seconds)`,
    );

    // Handle rate limiting or potential 403 with 0 remaining
    if (
      (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') ||
      response.status === 429
    ) {
      if (retryCount < maxRetries) {
        let waitTime = 0;
        if (response.headers.get('X-RateLimit-Reset')) {
          waitTime = Number(response.headers.get('X-RateLimit-Reset')) * 1000 - Date.now() + 1000;
          waitTime = Math.min(waitTime, 10 * 60 * 1000); // cap at 10 minutes
        } else {
          // exponential backoff with jitter
          waitTime = Math.min(1000 * Math.pow(2, retryCount) + Math.random() * 1000, 60000);
        }

        console.log(
          `Rate limit hit. Retrying in ${Math.floor(waitTime / 1000)} seconds (retry ${
            retryCount + 1
          }/${maxRetries})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return makeGitHubGraphQLRequest<T>(token, query, variables, retryCount + 1, maxRetries);
      }

      throw new Error(
        `GitHub API rate limit exceeded. Resets at ${rateLimit.reset}. Please try again later.`,
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `GitHub GraphQL API error (${response.status})`;
      try {
        const errorData = JSON.parse(errorText);
        if (errorData.errors) {
          errorMessage += `: ${JSON.stringify(errorData.errors)}`;
        } else {
          errorMessage += `: ${JSON.stringify(errorData)}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();
    if (data.errors) {
      throw new Error(`GitHub GraphQL response errors: ${JSON.stringify(data.errors)}`);
    }

    return data as GitHubGraphQLResponse<T>;
  } catch (error) {
    console.error(`Error in makeGitHubGraphQLRequest:`, error);
    throw error;
  }
}

// Minimal REST-based fetch for commits
async function makeGitHubRESTRequest(
  url: string,
  token: string,
  retryCount = 0,
  maxRetries = 3,
): Promise<GitHubRESTCommitResponse> {
  try {
    console.log(`Making GitHub REST request to: ${url}`);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `Bearer ${token}`,
      },
    });

    // Rate limit check
    const rateLimit = {
      limit: response.headers.get('X-RateLimit-Limit'),
      remaining: response.headers.get('X-RateLimit-Remaining'),
      reset: response.headers.get('X-RateLimit-Reset')
        ? new Date(Number(response.headers.get('X-RateLimit-Reset')) * 1000).toLocaleString()
        : 'unknown',
      resetSeconds: response.headers.get('X-RateLimit-Reset')
        ? Number(response.headers.get('X-RateLimit-Reset')) - Math.floor(Date.now() / 1000)
        : 0,
    };
    console.log(
      `GitHub API rate limit: ${rateLimit.remaining}/${rateLimit.limit}, resets at ${rateLimit.reset} (in ${rateLimit.resetSeconds} seconds)`,
    );

    if (
      (response.status === 403 && response.headers.get('X-RateLimit-Remaining') === '0') ||
      response.status === 429
    ) {
      if (retryCount < maxRetries) {
        let waitTime = 0;
        if (response.headers.get('X-RateLimit-Reset')) {
          waitTime = Number(response.headers.get('X-RateLimit-Reset')) * 1000 - Date.now() + 1000;
          // cap at 10 minutes
          waitTime = Math.min(waitTime, 10 * 60 * 1000);
        } else {
          // exponential backoff with jitter
          waitTime = Math.min(1000 * Math.pow(2, retryCount) + Math.random() * 1000, 60000);
        }

        console.log(
          `Rate limit hit. Retrying in ${Math.floor(waitTime / 1000)} seconds (retry ${
            retryCount + 1
          }/${maxRetries})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return makeGitHubRESTRequest(url, token, retryCount + 1, maxRetries);
      }
      const resetTime = rateLimit.reset;
      throw new Error(
        `GitHub API rate limit exceeded. Resets at ${resetTime}. Please try again later.`,
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `GitHub REST API error (${response.status})`;

      try {
        const errorData = JSON.parse(errorText);
        if (errorData.message) {
          errorMessage += `: ${errorData.message}`;
        } else {
          errorMessage += `: ${errorText}`;
        }
      } catch {
        errorMessage += `: ${errorText}`;
      }

      throw new Error(errorMessage);
    }

    return response.json() as Promise<GitHubRESTCommitResponse>;
  } catch (error) {
    console.error(`Error in makeGitHubRESTRequest for ${url}:`, error);
    throw error;
  }
}

// Fetch PRs using GraphQL Search
async function fetchUserPRs(
  repos: string[],
  username: string,
  startDate: string,
  endDate: string,
  token: string,
): Promise<GitHubPR[]> {
  console.log(
    `Fetching PRs (GraphQL) for ${username} from ${startDate} to ${endDate} across ${repos.length} repositories`,
  );

  // Batch size and delay for rate limiting management
  const batchSize = 10;
  const delayBetweenBatches = 3000;
  let results: GitHubPR[] = [];

  async function fetchRepoPRs(repo: string): Promise<GitHubPR[]> {
    const repoNamePart = repo.includes('/') ? repo : `UnknownOrg/${repo}`;
    const searchQuery = `repo:${repoNamePart} author:${username} created:${startDate}..${endDate} type:pr`;

    const repoPRs: GitHubPR[] = [];
    let hasNextPage = true;
    let afterCursor: string | null = null;

    const gqlQuery = `
      query($searchQuery: String!, $after: String) {
        search(query: $searchQuery, type: ISSUE, first: 100, after: $after) {
          nodes {
            ... on PullRequest {
              number
              title
              createdAt
              repository {
                name
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    `;

    while (hasNextPage) {
      const variables: GitHubGraphQLVariables = { searchQuery, after: afterCursor };
      const data: GitHubGraphQLResponse<GitHubGraphQLSearchResponse> =
        await makeGitHubGraphQLRequest<GitHubGraphQLSearchResponse>(token, gqlQuery, variables);
      const currentNodes = (data.data.search.nodes || []).filter(
        (node: unknown): node is GitHubGraphQLNode => node !== null,
      );
      const pageInfo: GitHubGraphQLPageInfo = data.data.search.pageInfo;

      hasNextPage = pageInfo.hasNextPage;
      afterCursor = pageInfo.endCursor;

      currentNodes.forEach((node: GitHubGraphQLNode) => {
        const { title, number, createdAt, repository } = node;
        if (title && number && createdAt && repository?.name) {
          repoPRs.push({
            title,
            number,
            createdAt,
            repo: repository.name,
          });
        }
      });
    }

    return repoPRs;
  }

  for (let i = 0; i < repos.length; i += batchSize) {
    const batch = repos.slice(i, i + batchSize);
    console.log(
      `Fetching PR batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(repos.length / batchSize)}`,
    );

    const batchData = await Promise.all(
      batch.map(async (r) => {
        try {
          return await fetchRepoPRs(r);
        } catch (error) {
          console.error(`Error fetching PRs for ${r}`, error);
          return [];
        }
      }),
    );

    results = results.concat(...batchData);

    if (i + batchSize < repos.length) {
      console.log(`Waiting ${delayBetweenBatches}ms before next PR batch...`);
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return results;
}

// Fetch commits using the REST API
async function fetchUserCommits(
  repos: string[],
  username: string,
  startDate: string,
  endDate: string,
  token: string,
): Promise<GitHubCommit[]> {
  console.log(
    `Fetching commits (REST) for ${username} from ${startDate} to ${endDate} across ${repos.length} repositories`,
  );

  const batchSize = 10;
  const delayBetweenBatches = 3000;
  let results: GitHubCommit[] = [];

  async function fetchRepoCommits(repo: string): Promise<GitHubCommit[]> {
    try {
      const searchQuery = `repo:${repo} author:${username} committer-date:${startDate}..${endDate}`;
      // REST search
      let allCommits: GitHubCommit[] = [];
      let page = 1;
      let hasMorePages = true;

      while (hasMorePages) {
        const url = `https://api.github.com/search/commits?q=${encodeURIComponent(
          searchQuery,
        )}&page=${page}&per_page=100`;
        const data = await makeGitHubRESTRequest(url, token);
        if (data.items && Array.isArray(data.items)) {
          const commits = data.items.map((item) => {
            return {
              commit: {
                author: {
                  date: item.commit.author.date,
                },
                message: item.commit.message,
              },
              repo: item.repository.full_name.split('/')[1],
            } as GitHubCommit;
          });
          allCommits = allCommits.concat(commits);
          hasMorePages = data.items.length === 100;
          page++;
        } else {
          hasMorePages = false;
        }
      }
      return allCommits;
    } catch (error) {
      console.error(`Error fetching commits for ${repo}`, error);
      return [];
    }
  }

  for (let i = 0; i < repos.length; i += batchSize) {
    const batch = repos.slice(i, i + batchSize);
    console.log(
      `Fetching commits batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(
        repos.length / batchSize,
      )}`,
    );

    const batchCommits = await Promise.all(batch.map(fetchRepoCommits));
    results = results.concat(...batchCommits);

    // Delay between batches
    if (i + batchSize < repos.length) {
      console.log(`Waiting ${delayBetweenBatches}ms before next commit batch...`);
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return results;
}

// Helper function to format a date as YYYY-MM-DD
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Helper function to format display dates
function formatDisplayDate(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayName = days[date.getDay()];
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `${dayName} ${month}/${day}`;
}

// Get date range for the report
async function getDateRange(
  offsetWeeks: number = 0,
  startDateStr?: string,
  endDateStr?: string,
): Promise<{ startDate: string; endDate: string }> {
  // If explicit dates are provided, use them
  if (startDateStr && endDateStr) {
    return {
      startDate: startDateStr,
      endDate: endDateStr,
    };
  }

  // Otherwise, calculate based on current date
  const now = new Date();
  if (offsetWeeks === 0) {
    // Default case: previous 7 days from today
    const endDate = new Date(now);
    const startDate = new Date(now);
    startDate.setDate(now.getDate() - 7);

    return {
      startDate: formatDate(startDate),
      endDate: formatDate(endDate),
    };
  } else {
    // Legacy offset: weeks from last Sunday
    const day = now.getDay();
    const diff = day === 0 ? 7 : day;
    const lastSunday = new Date(now);
    lastSunday.setDate(now.getDate() - diff - 7 * offsetWeeks);
    const nextSaturday = new Date(lastSunday);
    nextSaturday.setDate(lastSunday.getDate() + 6);

    return {
      startDate: formatDate(lastSunday),
      endDate: formatDate(nextSaturday),
    };
  }
}

// Fetch user repositories
async function fetchUserRepositories(
  username: string,
  organization: string,
  token: string,
  lookbackMonths: number = 6,
): Promise<string[]> {
  console.log(
    `Fetching repositories for user ${username} in organization ${organization} and personal repositories`,
  );

  try {
    // Calculate date from X months ago
    const lookbackDate = new Date();
    lookbackDate.setMonth(lookbackDate.getMonth() - lookbackMonths);
    const startDate = formatDate(lookbackDate);
    const endDate = formatDate(new Date());

    const repoSet = new Set<string>();

    // GraphQL user(...) for personal repos
    console.log(`Fetching personal repositories for ${username}`);

    const personalReposQuery = `
      query($login: String!, $after: String) {
        user(login: $login) {
          repositories(first: 100, after: $after, privacy: PUBLIC, ownerAffiliations: OWNER) {
            nodes {
              name
              nameWithOwner
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    `;

    let personalHasNext = true;
    let personalAfter: string | null = null;

    while (personalHasNext) {
      const data: GitHubGraphQLResponse<GitHubGraphQLUserResponse> =
        await makeGitHubGraphQLRequest<GitHubGraphQLUserResponse>(token, personalReposQuery, {
          login: username,
          after: personalAfter,
        });
      const repoNodes = data.data.user.repositories.nodes || [];
      repoNodes.forEach((node: { name: string; nameWithOwner: string }) => {
        if (node.nameWithOwner) {
          repoSet.add(node.nameWithOwner);
        }
      });
      personalHasNext = data.data.user.repositories.pageInfo.hasNextPage;
      personalAfter = data.data.user.repositories.pageInfo.endCursor;
    }

    console.log(`Found ${repoSet.size} personal repositories via GraphQL.`);

    // REST for searching commits in the org
    console.log(
      `Searching for commits by ${username} in org ${organization} from ${startDate}..${endDate}`,
    );
    let page = 1;
    let hasMorePages = true;
    while (hasMorePages) {
      const searchQuery = `org:${organization} author:${username} committer-date:${startDate}..${endDate}`;
      const url = `https://api.github.com/search/commits?q=${encodeURIComponent(
        searchQuery,
      )}&per_page=100&page=${page}`;
      // Use the same accept for commits
      const data = await makeGitHubRESTRequest(url, token);
      if (Array.isArray(data.items) && data.items.length > 0) {
        data.items.forEach((item) => {
          if (item.repository && item.repository.full_name) {
            repoSet.add(item.repository.full_name);
          }
        });
        hasMorePages = data.items.length === 100;
        page++;
      } else {
        hasMorePages = false;
      }
    }

    console.log(`Total repos after org commit search: ${repoSet.size}.`);

    return Array.from(repoSet);
  } catch (error) {
    console.error(`Error fetching user repositories:`, error);
    return [];
  }
}

// Generate weekly report
async function generateWeeklyReport(
  repos: string[],
  startDate: string,
  endDate: string,
  token: string,
  username: string,
  openAiApiKey?: string,
  openAiModel: string = 'gpt-4o',
): Promise<string> {
  try {
    // PRs via GraphQL, commits via REST
    const [prs, commits] = await Promise.all([
      fetchUserPRs(repos, username, startDate, endDate, token),
      fetchUserCommits(repos, username, startDate, endDate, token),
    ]);

    console.log(`Found ${prs.length} PRs and ${commits.length} commits.`);

    // Prepare the markdown report
    let reportContent = `# Weekly Report for ${username}: ${startDate} to ${endDate}\n\n`;

    const startDateObj = new Date(startDate);

    // We iterate for 7 days
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startDateObj);
      currentDate.setDate(startDateObj.getDate() + i);

      const dateStr = formatDate(currentDate);
      const displayDate = formatDisplayDate(currentDate);

      reportContent += `## ${displayDate}\n\n`;

      // Filter PRs for this day
      const dayPRs = prs.filter((pr) => pr.createdAt.startsWith(dateStr));
      if (dayPRs.length > 0) {
        reportContent += `  ### PRs\n\n`;
        for (const pr of dayPRs) {
          reportContent += `  - [#${pr.number}] ${pr.title} (${pr.repo})\n`;
        }
        reportContent += `\n`;
      }

      // Filter commits for this day
      const dayCommits = commits.filter((commit) => commit.commit.author.date.startsWith(dateStr));
      if (dayCommits.length > 0) {
        reportContent += `  ### Commits\n\n`;
        for (const c of dayCommits) {
          const message = c.commit.message.replace(/\n/g, ' ');
          reportContent += `  - ${message} (${c.repo})\n`;
        }
        reportContent += `\n`;
      }

      reportContent += `\n`;
    }

    // Optionally call OpenAI to generate a summary
    if (openAiApiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openAiApiKey}`,
          },
          body: JSON.stringify({
            model: openAiModel,
            temperature: 0.2,
            messages: [
              {
                role: 'system',
                content:
                  'You are a professional assistant generating summaries of GitHub activity. Your summary should be concise, focused on major themes, and clearly organize work into categories. Highlight key accomplishments and focus areas.',
              },
              { role: 'user', content: reportContent },
            ],
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const summary = data.choices[0].message.content;
          reportContent += `\n### Quick Summary:\n${summary}\n`;
        }
      } catch (error) {
        console.error('Error generating AI summary:', error);
        reportContent += `\n### Quick Summary:\nFailed to generate AI summary.\n`;
      }
    }

    return reportContent;
  } catch (error) {
    if (error instanceof Error) {
      return `Error generating weekly report: ${error.message}`;
    }
    return 'Error generating weekly report: Unknown error';
  }
}

const weeklyReport = {
  id: 'weeklyReport',
  name: 'Weekly Report',
  description:
    'Generates a weekly report of GitHub activity for a specific user including PRs and commits',
  inputSchema: z.object({
    username: z.string().describe('GitHub username to generate report for'),
    offset: z
      .number()
      .optional()
      .default(0)
      .describe('Offset the week range by this many weeks (default: 0)'),
    repos: z.array(z.string()).optional().describe('List of repositories to include in the report'),
    generateSummary: z
      .boolean()
      .optional()
      .default(false)
      .describe('Whether to generate an AI summary (default: false)'),
    organization: z
      .string()
      .optional()
      .default('Triple-Whale')
      .describe('GitHub organization name'),
    startDate: z.string().optional().describe('Start date in YYYY-MM-DD format (overrides offset)'),
    endDate: z.string().optional().describe('End date in YYYY-MM-DD format (overrides offset)'),
  }),
  execute: async ({
    username,
    offset = 0,
    repos,
    generateSummary = false,
    organization = 'Triple-Whale',
    startDate,
    endDate,
  }: WeeklyReportParams) => {
    console.log(`Generating weekly report for ${username}...`);

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
    if (!GITHUB_TOKEN) {
      throw new Error(
        'GitHub token is required. Please set GITHUB_TOKEN in your environment variables.',
      );
    }

    // Validate with a small GraphQL call
    try {
      const testQuery = `query { viewer { login } }`;
      await makeGitHubGraphQLRequest<GitHubGraphQLViewerResponse>(GITHUB_TOKEN, testQuery);
    } catch (error) {
      console.error('Error validating GitHub token with GraphQL:', error);
      if (error instanceof Error) {
        return `Error: GitHub token validation failed - ${error.message}`;
      }
      return 'Error: GitHub token validation failed';
    }

    // Default fallback repos if none provided
    const fallbackRepos = [
      `${organization}/backend-packages`,
      `${organization}/triplewhale-backend`,
      `${organization}/triplewhale-client`,
      `${organization}/triplewhale-admin`,
      `${organization}/fetchers`,
      `${organization}/devops`,
      `${organization}/ai`,
    ];

    let finalRepos: string[] = [];

    if (!repos) {
      // Attempt to fetch repos
      try {
        console.log(`Attempting to fetch repositories for ${username} in ${organization}`);
        const userRepos = await fetchUserRepositories(username, organization, GITHUB_TOKEN);
        if (userRepos.length > 0) {
          console.log(`Found ${userRepos.length} repos for user, plus fallback merged in`);
          finalRepos = [...new Set([...userRepos, ...fallbackRepos])];
        } else {
          console.log('No user repos found, using fallback list only.');
          finalRepos = fallbackRepos;
        }
      } catch (error) {
        console.error('Error fetching user repositories:', error);
        finalRepos = fallbackRepos;
      }
    } else {
      console.log(`Using provided repos: ${JSON.stringify(repos)}`);
      finalRepos = repos.map((r) => (r.includes('/') ? r : `${organization}/${r}`));
    }

    try {
      const { startDate: calculatedStartDate, endDate: calculatedEndDate } = await getDateRange(
        offset,
        startDate,
        endDate,
      );

      const openAiApiKey = generateSummary ? process.env.OPENAI_API_KEY : undefined;
      if (generateSummary && !openAiApiKey) {
        console.warn('OpenAI API key not found. Summary will not be generated.');
      }

      const report = await generateWeeklyReport(
        finalRepos,
        calculatedStartDate,
        calculatedEndDate,
        GITHUB_TOKEN,
        username,
        openAiApiKey,
      );

      return report;
    } catch (error) {
      console.error('Error in weeklyReport:', error);
      if (error instanceof Error) {
        return `Error generating weekly report: ${error.message}`;
      }
      return 'Error generating weekly report: Unknown error';
    }
  },
};

export { weeklyReport };
