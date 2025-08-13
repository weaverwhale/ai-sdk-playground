import { z } from 'zod';
import { load as cheerioLoad } from 'cheerio';

// Define the parameter types to match the zod schema
type UrbanDictionaryParams = {
  term: string;
};

const urbanDictionary = {
  id: 'urbanDictionary',
  name: 'Urban Dictionary',
  description: 'Useful for looking up slang definitions and internet culture terms',
  inputSchema: z.object({
    term: z.string().describe('The term to look up'),
  }),
  execute: async ({ term }: UrbanDictionaryParams) => {
    console.log('Searching for term:', term);
    const url = `http://www.urbandictionary.com/define.php?term=${encodeURIComponent(term)}`;
    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`;

    try {
      const htmlResponse = await fetch(proxyUrl);
      if (!htmlResponse.ok) {
        throw new Error(`API request failed with status ${htmlResponse.status}`);
      }

      const html = await htmlResponse.text();
      const $ = cheerioLoad(html, { scriptingEnabled: true });
      let text = '';
      const rootElement = 'body';

      $(`${rootElement} main *`)
        .not('style, script, svg')
        .each((_i: number, elem) => {
          let content = $(elem).clone().children().remove().end().text().trim();
          if ($(elem).find('script').length > 0) {
            return;
          }
          const $el = $(elem);
          let href = $el.attr('href');
          if ($el.prop('tagName')?.toLowerCase() === 'a' && href) {
            if (!href.startsWith('http')) {
              try {
                href = new URL(href, url).toString();
              } catch {
                href = '';
              }
            }
            const imgAlt = $el.find('img[alt]').attr('alt')?.trim();
            if (imgAlt) {
              content += ` ${imgAlt}`;
            }
            text += ` [${content}](${href})`;
          } else if (content !== '') {
            text += ` ${content}`;
          }
        });

      return text.trim().replace(/\n+/g, ' ');
    } catch (error) {
      console.error('Error querying Urban Dictionary:', error);
      return 'Error: Could not fetch definition from Urban Dictionary.';
    }
  },
};

export { urbanDictionary };
