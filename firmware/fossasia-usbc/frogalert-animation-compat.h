#ifndef FROGALERT_ANIMATION_COMPAT_H
#define FROGALERT_ANIMATION_COMPAT_H

#include <stdint.h>

#define FROGALERT_ANIMATION_VISIBLE_COLUMNS 44U
#define FROGALERT_ANIMATION_WIRE_COLUMNS    48U
#define FROGALERT_ANIMATION_WIRE_INSET      2U

uint8_t frogalert_animation_has_padded_frames(const uint16_t *bitmap,
					      uint16_t width);
uint16_t frogalert_animation_frame_count(const uint16_t *bitmap,
					 uint16_t width);
void frogalert_animation_copy_visible_frame(const uint16_t *bitmap,
					    uint16_t width,
					    uint16_t frame,
					    uint16_t *visible);

#endif
