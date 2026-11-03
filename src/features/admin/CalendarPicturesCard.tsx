import { Button, Card, SemanticColor, Stack, Text, ToggleSwitch } from '@beezyworks/design'
import { type CalendarMonth, monthTitles, type CalendarBasis } from '@beitecha/engine'
import React from 'react'

import { Field } from '@/components/Field'
import { Segments } from '@/components/Segments'
import { Select } from '@/components/Select'
import type { PicturePlacement } from '@/features/calendar/html'
import {
  type BackImage,
  fillInOrder,
  NONE,
  type PictureSettings,
} from '@/features/calendar/pictures'
import type { usePictures } from '@/features/calendar/usePictures'

const AUTO = 'auto'
const NO_PICTURE = ''

/** A picture's sharpness on a full sheet: pixels over the sheet's long side in inches. */
const dpi = (image: BackImage) => Math.round(Math.max(image.width, image.height) / 11)

/** The pictures on the calendar: added here, kept in this browser, laid on the months and the covers. */
export function CalendarPicturesCard({
  pictures,
  months,
  basis,
  lang,
}: {
  pictures: ReturnType<typeof usePictures>
  months: CalendarMonth[]
  basis: CalendarBasis
  lang: 'en' | 'he'
}) {
  const { settings: s, images, progress, set, add, remove, move } = pictures
  const dealt = fillInOrder(months, images)
  const imageOptions = images.map((i) => ({ value: i.id, label: i.name }))
  const named = (start: string) => {
    const m = months.find((x) => x.start === start)
    return m ? monthTitles(basis, m.start, m.end, lang).title : start
  }
  const opposite = s.placement === 'opposite'

  return (
    <Card gap="md">
      <Text variant="sectionHeader">Pictures</Text>
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        Kept in this browser only: they are never uploaded. A picture can be moved, zoomed and
        turned in the preview, and the crop prints as you see it.
      </Text>
      <Stack direction="row" align="center" gap="md" wrap>
        <Button
          variant="secondary"
          icon="add"
          title="Add pictures"
          disabled={!!progress}
          onPress={() => void add()}
        />
        {!!progress && (
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            Preparing {progress.done} of {progress.total}…
          </Text>
        )}
      </Stack>
      {images.map((image, i) => (
        <Stack key={image.id} direction="row" align="center" gap="md">
          <img
            src={image.preview}
            alt=""
            style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 4 }}
          />
          <Stack grow gap="xs">
            <Text variant="body">{image.name}</Text>
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              {image.width} × {image.height} px
              {dpi(image) < 150 ? ' · low resolution for a full sheet' : ''}
            </Text>
          </Stack>
          <Button
            variant="ghost"
            size="sm"
            title="Up"
            disabled={i === 0}
            onPress={() => move(image.id, -1)}
          />
          <Button
            variant="ghost"
            size="sm"
            title="Down"
            disabled={i === images.length - 1}
            onPress={() => move(image.id, 1)}
          />
          <Button variant="ghost" size="sm" title="Remove" onPress={() => remove(image.id)} />
        </Stack>
      ))}
      {!!images.length && (
        <>
          <Stack gap="xs">
            <Text variant="label" color={SemanticColor.TextSecondary}>
              Where they go
            </Text>
            <Segments<PicturePlacement>
              options={[
                { key: 'above', label: 'Above each month' },
                { key: 'opposite', label: 'Back of the page before' },
              ]}
              value={s.placement}
              onChange={(placement) => set({ placement })}
              accessibilityLabel="Where the pictures go"
            />
            <Text variant="caption" color={SemanticColor.TextSecondary}>
              “Back of the page before” is for a wall calendar printed double-sided and hung with
              each page turned up: the month’s picture hangs above it. The first month’s is behind
              the cover.
            </Text>
          </Stack>
          <Stack gap="xs">
            <Text variant="label" color={SemanticColor.TextSecondary}>
              Fit
            </Text>
            <Segments<PictureSettings['fit']>
              options={[
                { key: 'cover', label: 'Fill the space' },
                { key: 'contain', label: 'Show the whole picture' },
              ]}
              value={s.fit}
              onChange={(fit) => set({ fit })}
              accessibilityLabel="Picture fit"
            />
          </Stack>
          {!opposite && (
            <Stack direction="row" align="center" gap="md">
              <Stack grow gap="xs">
                <Text variant="body">Month’s name over the picture</Text>
                <Text variant="caption" color={SemanticColor.TextSecondary}>
                  The picture reaches the top of the page.
                </Text>
              </Stack>
              <ToggleSwitch
                value={s.titleOver}
                onValueChange={(titleOver) => set({ titleOver })}
                accessibilityLabel="Month’s name over the picture"
              />
            </Stack>
          )}
          <Stack gap="sm">
            <Stack direction="row" align="center" gap="md">
              <Stack grow>
                <Text variant="label" color={SemanticColor.TextSecondary}>
                  Picture for each month
                </Text>
              </Stack>
              <Button
                variant="ghost"
                size="sm"
                title="Deal out in order"
                onPress={() => set({ matches: {} })}
              />
            </Stack>
            {months.map((m) => {
              const own = s.matches[m.start]
              return (
                <Stack key={m.start} direction="row" align="center" gap="md" wrap>
                  <Stack grow width={0}>
                    <Text variant="body">{named(m.start)}</Text>
                  </Stack>
                  <Select
                    accessibilityLabel={`Picture for ${named(m.start)}`}
                    value={own ?? AUTO}
                    options={[
                      {
                        value: AUTO,
                        label: `In order: ${images.find((i) => i.id === dealt[m.start])?.name ?? 'none'}`,
                      },
                      { value: NONE, label: 'Blank' },
                      ...imageOptions,
                    ]}
                    onChange={(v) => {
                      const matches = { ...s.matches }
                      if (v === AUTO) delete matches[m.start]
                      else matches[m.start] = v
                      set({ matches })
                    }}
                  />
                </Stack>
              )
            })}
          </Stack>
        </>
      )}
      <Stack gap="sm">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Covers
        </Text>
        <Stack direction="row" align="center" gap="md">
          <Stack grow gap="xs">
            <Text variant="body">Front cover</Text>
            {opposite && (
              <Text variant="caption" color={SemanticColor.TextSecondary}>
                Always there with pictures on the pages before.
              </Text>
            )}
          </Stack>
          <ToggleSwitch
            value={s.front || opposite}
            disabled={opposite}
            onValueChange={(front) => set({ front })}
            accessibilityLabel="Front cover"
          />
        </Stack>
        {(s.front || opposite) && (
          <>
            <Select
              accessibilityLabel="Front cover picture"
              value={s.coverId ?? NO_PICTURE}
              options={[{ value: NO_PICTURE, label: 'No picture' }, ...imageOptions]}
              onChange={(v) => set({ coverId: v || undefined })}
            />
            <Field
              label="Title"
              placeholder="The months the calendar spans"
              value={s.coverTitle}
              onChangeText={(coverTitle) => set({ coverTitle })}
            />
            <Field
              label="Subtitle"
              placeholder="The same months in the other calendar"
              value={s.coverSubtitle}
              onChangeText={(coverSubtitle) => set({ coverSubtitle })}
            />
          </>
        )}
        <Stack direction="row" align="center" gap="md">
          <Stack grow>
            <Text variant="body">Back cover</Text>
          </Stack>
          <ToggleSwitch
            value={s.back}
            onValueChange={(back) => set({ back })}
            accessibilityLabel="Back cover"
          />
        </Stack>
        {s.back && (
          <Select
            accessibilityLabel="Back cover picture"
            value={s.backCoverId ?? NO_PICTURE}
            options={[{ value: NO_PICTURE, label: 'No picture (blank)' }, ...imageOptions]}
            onChange={(v) => set({ backCoverId: v || undefined })}
          />
        )}
      </Stack>
    </Card>
  )
}
