#include <assert.h>
#include <stddef.h>
#include <stdint.h>

#include "frogalert-animation-compat.h"

static void assert_frame(const uint16_t *frame, uint16_t start)
{
	for (uint16_t column = 0;
	     column < FROGALERT_ANIMATION_VISIBLE_COLUMNS; column++)
		assert(frame[column] == start + column);
}

int main(void)
{
	uint16_t visible[FROGALERT_ANIMATION_VISIBLE_COLUMNS];
	uint16_t direct[FROGALERT_ANIMATION_VISIBLE_COLUMNS];
	uint16_t padded[FROGALERT_ANIMATION_WIRE_COLUMNS] = {0};
	uint16_t two_frames[FROGALERT_ANIMATION_WIRE_COLUMNS * 2] = {0};
	uint16_t unrecognized[FROGALERT_ANIMATION_WIRE_COLUMNS] = {0};

	for (uint16_t column = 0;
	     column < FROGALERT_ANIMATION_VISIBLE_COLUMNS; column++) {
		direct[column] = column + 1;
		padded[column + FROGALERT_ANIMATION_WIRE_INSET] = column + 1;
		two_frames[column + FROGALERT_ANIMATION_WIRE_INSET] =
			column + 1;
		two_frames[FROGALERT_ANIMATION_WIRE_COLUMNS + column +
			   FROGALERT_ANIMATION_WIRE_INSET] = column + 101;
		unrecognized[column] = column + 1;
	}

	assert(frogalert_animation_has_padded_frames(direct,
						     sizeof(direct) /
						     sizeof(direct[0])) == 0);
	assert(frogalert_animation_frame_count(direct,
					       sizeof(direct) /
					       sizeof(direct[0])) == 1);
	frogalert_animation_copy_visible_frame(
		direct, sizeof(direct) / sizeof(direct[0]), 0, visible);
	assert_frame(visible, 1);

	assert(frogalert_animation_has_padded_frames(
		       padded, sizeof(padded) / sizeof(padded[0])) == 1);
	assert(frogalert_animation_frame_count(
		       padded, sizeof(padded) / sizeof(padded[0])) == 1);
	frogalert_animation_copy_visible_frame(
		padded, sizeof(padded) / sizeof(padded[0]), 0, visible);
	assert_frame(visible, 1);

	assert(frogalert_animation_has_padded_frames(
		       two_frames,
		       sizeof(two_frames) / sizeof(two_frames[0])) == 1);
	assert(frogalert_animation_frame_count(
		       two_frames,
		       sizeof(two_frames) / sizeof(two_frames[0])) == 2);
	frogalert_animation_copy_visible_frame(
		two_frames, sizeof(two_frames) / sizeof(two_frames[0]), 0,
		visible);
	assert_frame(visible, 1);
	frogalert_animation_copy_visible_frame(
		two_frames, sizeof(two_frames) / sizeof(two_frames[0]), 1,
		visible);
	assert_frame(visible, 101);

	unrecognized[47] = 99;
	assert(frogalert_animation_has_padded_frames(
		       unrecognized,
		       sizeof(unrecognized) / sizeof(unrecognized[0])) == 0);
	assert(frogalert_animation_frame_count(
		       unrecognized,
		       sizeof(unrecognized) / sizeof(unrecognized[0])) == 2);
	frogalert_animation_copy_visible_frame(
		unrecognized,
		sizeof(unrecognized) / sizeof(unrecognized[0]), 0, visible);
	assert_frame(visible, 1);

	frogalert_animation_copy_visible_frame(NULL, 0, 0, visible);
	for (uint16_t column = 0;
	     column < FROGALERT_ANIMATION_VISIBLE_COLUMNS; column++)
		assert(visible[column] == 0);

	return 0;
}
