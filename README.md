# Vite + Deno + Preact + TypeScript

## Running

You need to have Deno v2.0.0 or later installed to run this repo.

Start a dev server:

```
$ deno task dev
```

## Deploy

Build production assets:

```
$ deno task build
```

### GitHub Pages CI

This repo includes a GitHub Actions workflow at `.github/workflows/deploy-pages.yml`.
On every push to `main`, it runs `deno task build` and deploys the `dist` output to
GitHub Pages. Make sure Pages is configured to use the `github-pages` deployment
source.

## Credits

- [MY DIVINE PERVERSIONS / linear & gestalt](https://hellstarplus.bandcamp.com/album/my-divine-perversions-linear-gestalt) - by [hellstar.plus](https://hellstarplus.bandcamp.com)
populist47
- [MY BLOOD IS YOURS](https://www.youtube.com/watch?v=_qAxaTiuelg) - by [populist47](https://www.youtube.com/@populist47)
