EMCC ?= emcc
NODE ?= $(shell command -v node)
DEBUG_FLAGS ?=
FROTZ := ../my_jericho/frotz
SRC := $(FROTZ)/src
BUILD := build

COMMON := $(filter-out $(SRC)/common/getopt.c $(SRC)/common/helpers.c,$(wildcard $(SRC)/common/*.c))
DUMB := $(wildcard $(SRC)/dumb/*.c)
GAMES := $(wildcard $(SRC)/games/*.c)
ZTOOLS := $(filter-out $(SRC)/ztools/getopt.c $(SRC)/ztools/inforead.c,$(wildcard $(SRC)/ztools/*.c))
SOURCES := $(COMMON) $(DUMB) $(SRC)/blorb/blorblib.c wasm/jericho_bridge.c \
	$(SRC)/interface/frotz_interface.c $(SRC)/interface/md5.c $(GAMES) $(ZTOOLS)

INCLUDES := -I$(SRC)/common -I$(SRC)/dumb -I$(SRC)/blorb \
	-I$(SRC)/interface -I$(SRC)/games -I$(SRC)/ztools

EXPORTED_FUNCTIONS := '["_setup","_shutdown","_step","_save","_restore",\
"_get_score","_get_moves","_get_max_score","_get_self_object_num",\
"_get_num_world_objs","_get_object","_game_over","_victory","_halted",\
"_zbabel_object_exists","_zbabel_object_name","_zbabel_object_parent",\
"_zbabel_object_child","_zbabel_object_sibling","_zbabel_player_location",\
"_zbabel_inventory_first","_zbabel_clear_output","_zbabel_dictionary",\
"_getRAMSize","_getRAM","_setRAM","_get_narrative_text","_malloc","_free"]'
EXPORTED_RUNTIME_METHODS := '["ccall","FS","HEAPU8"]'

.PHONY: wasm smoke test clean

wasm: $(BUILD)/jericho.js

$(BUILD)/jericho.js: $(SOURCES)
	mkdir -p $(BUILD)
	$(EMCC) $(SOURCES) $(INCLUDES) -O2 -std=gnu99 -DNO_SOUND $(DEBUG_FLAGS) \
		-sMODULARIZE=1 -sEXPORT_NAME=createJericho \
		-sENVIRONMENT=web,node -sALLOW_MEMORY_GROWTH=1 -sFILESYSTEM=1 \
		-sEXPORTED_FUNCTIONS=$(EXPORTED_FUNCTIONS) \
		-sEXPORTED_RUNTIME_METHODS=$(EXPORTED_RUNTIME_METHODS) \
		--no-entry -o $@

smoke: wasm
	$(NODE) test/wasm-smoke.cjs

test: smoke
	$(NODE) test/game-session.test.mjs
	$(NODE) test/speech.test.mjs
	$(NODE) test/tts.test.mjs
	$(NODE) test/translation.test.mjs

clean:
	$(RM) $(BUILD)/jericho.js $(BUILD)/jericho.wasm
