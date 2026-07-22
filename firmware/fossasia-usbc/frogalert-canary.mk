# Read after the pinned upstream Makefile with GNU Make's second -f argument.
# This appends one inert C translation unit and retains its metadata symbol.
# It does not replace any upstream object, linker script, or startup file.
C_SOURCES += src/frogalert_canary.c
LDFLAGS += -Wl,--undefined=frogalert_build_canary

# The upstream ELF prerequisites were expanded while its Makefile was read,
# before this second makefile appended C_SOURCES. Add the new object explicitly.
$(BUILD_DIR)/$(TARGET).elf: $(BUILD_DIR)/src/frogalert_canary.o
