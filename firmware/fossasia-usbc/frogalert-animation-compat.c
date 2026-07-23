#include "frogalert-animation-compat.h"

uint8_t frogalert_animation_has_padded_frames(const uint16_t *bitmap,
					      uint16_t width)
{
	uint16_t base;

	if (!bitmap || width == 0 ||
	    width % FROGALERT_ANIMATION_WIRE_COLUMNS != 0)
		return 0;

	for (base = 0; base < width;
	     base += FROGALERT_ANIMATION_WIRE_COLUMNS) {
		if (bitmap[base] != 0 || bitmap[base + 1] != 0 ||
		    bitmap[base + 46] != 0 || bitmap[base + 47] != 0)
			return 0;
	}
	return 1;
}

uint16_t frogalert_animation_frame_count(const uint16_t *bitmap,
					 uint16_t width)
{
	if (!bitmap || width == 0)
		return 0;
	if (frogalert_animation_has_padded_frames(bitmap, width))
		return width / FROGALERT_ANIMATION_WIRE_COLUMNS;
	return (width + FROGALERT_ANIMATION_VISIBLE_COLUMNS - 1) /
	       FROGALERT_ANIMATION_VISIBLE_COLUMNS;
}

void frogalert_animation_copy_visible_frame(const uint16_t *bitmap,
					    uint16_t width,
					    uint16_t frame,
					    uint16_t *visible)
{
	uint8_t padded;
	uint32_t base;
	uint16_t column;

	if (!visible)
		return;

	padded = frogalert_animation_has_padded_frames(bitmap, width);
	base = (uint32_t)frame *
	       (padded ? FROGALERT_ANIMATION_WIRE_COLUMNS :
			 FROGALERT_ANIMATION_VISIBLE_COLUMNS);
	if (padded)
		base += FROGALERT_ANIMATION_WIRE_INSET;

	for (column = 0; column < FROGALERT_ANIMATION_VISIBLE_COLUMNS;
	     column++) {
		uint32_t source = base + column;

		visible[column] =
			bitmap && source < width ? bitmap[source] : 0;
	}
}
