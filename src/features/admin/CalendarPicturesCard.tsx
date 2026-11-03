import { Card, SemanticColor, Stack, Text, ToggleSwitch } from '@beezyworks/design'
import React from 'react'

import { Field } from '@/components/Field'
import { Segments } from '@/components/Segments'
import type { PicturePlacement } from '@/features/calendar/html'
import type { PictureSettings } from '@/features/calendar/pictures'
import type { usePictures } from '@/features/calendar/usePictures'

/** A picture's sharpness on a full sheet: pixels over the sheet's long side in inches. */
const dpi = (image: { width: number; height: number }) =>
  Math.round(Math.max(image.width, image.height) / 11)

/** Below this a picture may print soft on a full sheet. */
const SOFT_DPI = 150

/** The pictures on the calendar: put on the preview's pages, kept in this browser, laid on the months and the covers. */
export function CalendarPicturesCard({ pictures }: { pictures: ReturnType<typeof usePictures> }) {
  const { settings: s, images, progress, set } = pictures
  const opposite = s.placement === 'opposite'
  const none = s.placement === 'none'

  return (
    <Card gap="md">
      <Text variant="sectionHeader">Pictures</Text>
      <Text variant="caption" color={SemanticColor.TextSecondary}>
        Click an empty page in the preview to add a picture, or drop pictures onto it. Hover a
        picture to move, zoom, turn or remove it. Pictures stay in this browser, never uploaded, and
        print as you see them.
      </Text>
      {!!progress && (
        <Text variant="caption" color={SemanticColor.TextSecondary}>
          Adding pictures… {progress.done} of {progress.total}
        </Text>
      )}
      <Stack gap="xs">
        <Text variant="label" color={SemanticColor.TextSecondary}>
          Where they go
        </Text>
        <Segments<PicturePlacement>
          options={[
            { key: 'above', label: 'Above each month' },
            { key: 'opposite', label: 'Back of the page before' },
            { key: 'none', label: 'None' },
          ]}
          value={s.placement}
          onChange={(placement) => set({ placement })}
          accessibilityLabel="Where the pictures go"
        />
        {opposite && (
          <Text variant="caption" color={SemanticColor.TextSecondary}>
            For a wall calendar printed double-sided and hung with each page turned up: the month’s
            picture hangs above it. The first month’s is behind the cover. If the backs come out
            upside down, switch between flipping on the long edge and the short edge.
          </Text>
        )}
      </Stack>
      {!none && (
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
      )}
      {s.placement === 'above' && (
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
      {images
        .filter((image) => dpi(image) < SOFT_DPI)
        .map((image) => (
          <Text key={image.id} variant="caption" color={SemanticColor.TextAccent}>
            {`${image.name}: ${image.width} × ${image.height} px · ${dpi(image)} dpi on a full sheet: may print soft`}
          </Text>
        ))}
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
      </Stack>
    </Card>
  )
}
