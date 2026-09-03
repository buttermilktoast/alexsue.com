# One-time deployment setup

Everything in the repository is done. These steps are manual because they
happen in GitHub's settings and at the DNS registrar.

## 1. GitHub Pages source

Repository **Settings → Pages → Build and deployment → Source** → **GitHub Actions**.

Do this *before* the first push, or re-run the workflow afterwards — the deploy
job fails while the source is still set to a branch.

## 2. Custom domain

Settings → Pages → Custom domain → `alexsue.com`. `public/CNAME` already carries
this value, so each deploy re-asserts it.

Enable **Enforce HTTPS** once GitHub finishes provisioning the certificate
(usually minutes after DNS resolves; it can take up to 24h).

## 3. DNS at Porkbun

`alexsue.com` is registered at Porkbun (nameservers `*.ns.porkbun.com`).

### Baseline recorded 2026-09-02, before any change

Mail records that **must survive** the edit:

```text
MX    @                      10 mx01.mail.icloud.com.
MX    @                      10 mx02.mail.icloud.com.
TXT   @                      "apple-domain=4LFX0EoX5IVjZov0"
TXT   @                      "v=spf1 include:icloud.com ~all"
CNAME sig1._domainkey        sig1.dkim.alexsue.com.at.icloudmailadmin.com.
```

Web records that currently point at Porkbun's parking page and are the **only**
ones to replace:

```text
A     @      207.207.210.23 / .36 / .50
CNAME www    uixie.porkbun.com.
```

### Changes to make

Delete the three parking `A` records on `@` and add GitHub's four
(verified against GitHub's current documentation on 2026-09-02):

```text
A     @    185.199.108.153
A     @    185.199.109.153
A     @    185.199.110.153
A     @    185.199.111.153
```

Optionally add IPv6:

```text
AAAA  @    2606:50c0:8000::153
AAAA  @    2606:50c0:8001::153
AAAA  @    2606:50c0:8002::153
AAAA  @    2606:50c0:8003::153
```

Replace the `www` parking CNAME with:

```text
CNAME www  buttermilktoast.github.io.
```

Do not create a wildcard `*.alexsue.com` record.

### Pre-existing issue worth fixing separately

The apex currently publishes **two** SPF records:

```text
"v=spf1 include:_spf.porkbun.com ~all"
"v=spf1 include:icloud.com ~all"
```

RFC 7208 permits only one. Receivers that see two are required to return
`permerror`, which can hurt deliverability of mail sent from
`alex@alexsue.com`. This is unrelated to GitHub Pages and predates it. If
Porkbun's mail forwarding is not in use, delete the `_spf.porkbun.com` record;
if it is, merge them into a single record:

```text
"v=spf1 include:icloud.com include:_spf.porkbun.com ~all"
```

## 4. Verify

```sh
dig +short A alexsue.com          # expect the four 185.199.x.153 addresses
dig +short MX alexsue.com         # expect mx01/mx02.mail.icloud.com
dig +short CNAME sig1._domainkey.alexsue.com
curl -sI https://alexsue.com | head -1
curl -sI https://www.alexsue.com | head -1   # expect a redirect to the apex
```

Then send mail to and from `alex@alexsue.com`, confirm catch-all still
delivers, and confirm the footer hash on the live site matches the commit
GitHub Actions deployed.
