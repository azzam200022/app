const { withAndroidManifest } = require("@expo/config-plugins");

const RAWBT_PACKAGE = "ru.a402d.rawbtprinter";

module.exports = function withRawbtQueries(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const queries = Array.isArray(manifest.queries)
      ? manifest.queries
      : manifest.queries
        ? [manifest.queries]
        : [];
    const hasRawbtPackage = queries.some((query) => {
      const packages = Array.isArray(query.package)
        ? query.package
        : query.package
          ? [query.package]
          : [];
      return packages.some((entry) => entry.$?.["android:name"] === RAWBT_PACKAGE);
    });

    if (!hasRawbtPackage) {
      queries.push({ package: [{ $: { "android:name": RAWBT_PACKAGE } }] });
    }
    manifest.queries = queries;
    return config;
  });
};
