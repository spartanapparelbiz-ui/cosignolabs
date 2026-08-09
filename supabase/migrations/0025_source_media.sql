-- Source media: the actual pixels of an attached image, and the frames
-- sampled from an attached video.
--
-- Before this, an uploaded image was reduced to a one-line text stub
-- ("[image attached: IMG_4021.jpeg · 4032×3024]") and the bytes were dropped.
-- The operator was then asked to describe a photo it had never seen, so it
-- guessed from the filename. Keeping the pixels is what makes the difference
-- between reading an image and inventing a description of one.
--
-- Shape: [{ "mime": "image/jpeg", "data": "<base64>", "label": "receipt.jpg" }]
-- Frames of a video use the same shape, labeled with their timestamp.
alter table mission_sources
  add column if not exists media jsonb not null default '[]'::jsonb;

-- A source row is now big enough that SELECT * on a list endpoint matters.
-- Callers that only need the chip (name, status, size) must not drag the
-- base64 along; the store's list queries name their columns explicitly.
comment on column mission_sources.media is
  'Images the operator actually sees: the image itself, or frames sampled from a video. Base64. Excluded from list queries — read it only when building a model call.';

-- Video is a first-class source kind: frames are sampled in the browser
-- (which already has a decoder) and posted as images, so no video bytes are
-- ever stored or shipped to a server-side transcoder.
alter table mission_sources
  drop constraint if exists mission_sources_kind_check;
alter table mission_sources
  add constraint mission_sources_kind_check
  check (kind in ('file', 'link', 'video'));

-- Bound what one row can hold. Eight frames at ~600 KB of base64 each is the
-- practical ceiling for a single call, and this stops a hostile or buggy
-- client turning an upload into unbounded storage.
alter table mission_sources
  drop constraint if exists mission_sources_media_size_check;
alter table mission_sources
  add constraint mission_sources_media_size_check
  check (pg_column_size(media) <= 8 * 1024 * 1024);
