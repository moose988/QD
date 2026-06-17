# Wedding invitation media (static files)

Invitation **details** (names, date, venue, RSVP, theme, etc.) are edited in the admin panel and stored in Firestore.

**Media files** (cover image, music, gallery photos) live in this repo under `assets/invitations/` and are deployed with the website.

## Folder structure

Create one folder per wedding using the invitation **slug** from admin:

```
assets/invitations/ahmed-mariam/
  cover.jpg
  music.mp3
  photo-1.jpg
  photo-2.jpg
```

## Admin paths

In the wedding invitation editor, enter paths like:

- Cover: `/assets/invitations/ahmed-mariam/cover.jpg`
- Music: `/assets/invitations/ahmed-mariam/music.mp3`
- Gallery (one per line):
  - `/assets/invitations/ahmed-mariam/photo-1.jpg`
  - `/assets/invitations/ahmed-mariam/photo-2.jpg`

Paths may also use full `https://` URLs if hosted elsewhere.

## Deploy

After adding or changing media files, **redeploy the website** so guests receive the new files.

Editing names, date, time, location, or countdown in admin does **not** require adding files again — only Firestore is updated.

## Copy this template

Duplicate `_template/` and rename the folder to your invitation slug, then add your files.
