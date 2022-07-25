import fsp from 'fs/promises';
import robotsTxt from 'generate-robotstxt';
import path from 'path';
import axios from 'axios';

const publicPath = './public';
const defaultEnv = 'development';
const defaultOptions = {
  output: '/robots.txt',
  query: `{
    site {
      siteMetadata {
        siteUrl
      }
    }
  }`
};

function runQuery(handler, query) {
  return handler(query).then(res => {
    if (res.errors) {
      throw new Error(res.errors.join(', '));
    }

    return res.data;
  });
}

const getOptions = pluginOptions => {
  const options = { ...pluginOptions };

  delete options.plugins;

  const { env = {}, resolveEnv = () => process.env.GATSBY_ACTIVE_ENV || process.env.NODE_ENV } = options;

  const envOptions = env[resolveEnv()] || env[defaultEnv] || {};

  delete options.env;
  delete options.resolveEnv;

  return { ...options, ...envOptions };
};

export async function onPostBuild({ graphql, pathPrefix = "" }, pluginOptions) {
  const userOptions = getOptions(pluginOptions);
  const mergedOptions = { ...defaultOptions, ...userOptions };

  if (mergedOptions.host !== null) {
    if (
      !Object.prototype.hasOwnProperty.call(mergedOptions, 'host')
    ) {
      const {
        site: {
          siteMetadata: { siteUrl }
        }
      } = await runQuery(graphql, mergedOptions.query);

      mergedOptions.host = siteUrl;
    }
  }

  if (mergedOptions.sitemap !== null) {
    if (
      !Object.prototype.hasOwnProperty.call(mergedOptions, 'sitemap')
    ) {

      mergedOptions.sitemap = new URL(path.posix.join(pathPrefix, 'sitemap', 'sitemap-index.xml'), mergedOptions.host).toString();
    } else {
      try {
        new URL(mergedOptions.sitemap)
      } catch {
        mergedOptions.sitemap = new URL(mergedOptions.sitemap.startsWith(pathPrefix) ? mergedOptions.sitemap : path.posix.join(pathPrefix, mergedOptions.sitemap), mergedOptions.host).toString()
      }
    }
  }

  if (mergedOptions.external !== null) {
    if (
      !Object.prototype.hasOwnProperty.call(mergedOptions, 'external')
    ) {
      mergedOptions.external = mergedOptions.external.filter(url => {
        try {
          new URL(url)
        } catch {
          return false
        }
        return true
      });
    }
  }

  const { policy, sitemap, host, output, configFile, external } = mergedOptions;

  let content = await robotsTxt({
    policy,
    sitemap,
    host,
    configFile
  });

  for (const url of external) {
    const externalRes = await axios.get(url);
    const path = new URL(url).pathname;
    const subpath = path.substring(0, path.lastIndexOf('/'));
    let robots = externalRes.data;
    robots = robots.replace(/llow: \//gm, 'llow: ' + subpath + '/');
    robots = robots.replace(/^Sitemap: .*\n?/gm, '');
    content += robots;
  }


  const filename = path.join(publicPath, output);

  return fsp.writeFile(path.resolve(filename), content);
}
