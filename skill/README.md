# Beitecha skill

Lets you update your shul's sponsorships, notices, one-time changes, yahrzeits, birthdays and refuah names by
chatting with Claude ("Kiddush this week is sponsored by the Cohens in honor of Dovid's bar mitzvah").

## Setting it up (about 3 minutes)

1. In Claude, open **Settings > Capabilities** and turn on **Code execution and file creation**.
2. On the same page, under network access, allow the domain **beitecha.baderech.app**.
3. Open **Settings > Capabilities > Skills** (or Customize > Skills), choose **Upload skill**, and pick the
   `beitecha-skill.zip` you downloaded from Beitecha (Connect > Download Claude skill).
4. Start a new chat and say what you want changed. Claude will show you what it will do and ask for an OK first.

The zip contains your personal key. Don't share it. If it is lost, ask a gabbai to revoke it in Beitecha > Connect and
download a new one. Keys expire after a while; if Claude says the key expired, download the skill again.

## Using the script directly (technical members)

Python 3.9+, no installs. Put a `config.json` beside `beitecha.py`:

```json
{ "apiBase": "https://beitecha.baderech.app", "slug": "your-shul", "key": "bk_sec_...", "shulName": "Your Shul" }
```

```
python3 beitecha.py upcoming --days 14
python3 beitecha.py set-sponsor --ref kiddush@2026-11-07 --by "The Cohens" --honor "Dovid's bar mitzvah"
python3 beitecha.py op --json '{"op":"cholim.add","name":"..."}'
python3 beitecha.py --help
```

stdout is the API's JSON; stderr has a one-line summary. Errors exit non-zero. Tests: `python3 -m unittest`.
