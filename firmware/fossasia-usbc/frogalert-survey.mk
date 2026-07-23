# Read after the pinned upstream Makefile. This adds a bounded passive-survey
# module and keeps the upstream startup, linker, USB, display, button, and
# peripheral service objects as the final hardware shell.
C_SOURCES += src/ble/frogalert_survey.c
C_SOURCES += src/ble/frogalert_survey_core.c
C_SOURCES += src/frogalert_animation_compat.c
CFLAGS += -DFROGALERT_SURVEY=1
LDFLAGS += -Wl,--undefined=frogalert_survey_identity

$(BUILD_DIR)/$(TARGET).elf: \
	$(BUILD_DIR)/src/ble/frogalert_survey.o \
	$(BUILD_DIR)/src/ble/frogalert_survey_core.o \
	$(BUILD_DIR)/src/frogalert_animation_compat.o
