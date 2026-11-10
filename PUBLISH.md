# micro-wakeword4j-wasm - Publish

Release micro-wakeword4j first, and set the `micro-wakeword4j.version` property in `pom.xml` to that release.

Create a new release:

```shell
./mvnw release:prepare
./mvnw release:clean
```

Push the release commits and tag to GitHub:

```shell
git push origin main --follow-tags
```

GitHub Actions will publish the package to npm and create a GitHub release.

## First release

npm only lets GitHub Actions publish a package that already exists.
Before pushing the first release, publish it by hand from its tag:

```shell
git checkout v1.0.0
./mvnw package -DskipTests
npm login
npm publish ./target/dist --access public
git checkout main
```

Then add a trusted publisher in the package settings on npmjs.com: GitHub Actions, the `jvoice-project` owner, the `micro-wakeword4j-wasm` repository and the `build.yml` workflow.
