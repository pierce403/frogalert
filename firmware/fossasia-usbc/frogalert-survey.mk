# Read after the pinned upstream Makefile. This adds a bounded passive-survey
# module and keeps the upstream startup, linker, USB, display, button, and
# peripheral service objects as the final hardware shell.
C_SOURCES += src/ble/frogalert_survey.c
CFLAGS += -DFROGALERT_SURVEY=1
CFLAGS += -DFROGALERT_HARDWARE_PROFILE_ID=$(FROGALERT_HARDWARE_PROFILE_ID)
CFLAGS += -DFROGALERT_HARDWARE_PROFILE_NAME='"$(FROGALERT_HARDWARE_PROFILE_NAME)"'
CFLAGS += -DFROGALERT_VERSION='"$(FROGALERT_VERSION)"'
CFLAGS += -DFROGALERT_DISPLAY_VERSION='"$(FROGALERT_DISPLAY_VERSION)"'
LDFLAGS += -Wl,--undefined=frogalert_survey_identity

# Resolve Rust compiler-builtins and libc dependencies with the same final GCC
# linker. No Rust runtime, vectors, atomics, or alternative linker script.
LDFLAGS += -Wl,--start-group $(FROGALERT_RUST_LIB) $(LIBS) -Wl,--end-group
$(BUILD_DIR)/$(TARGET).elf: $(BUILD_DIR)/src/ble/frogalert_survey.o $(FROGALERT_RUST_LIB)
