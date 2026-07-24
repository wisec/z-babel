#include <stdlib.h>
#include <string.h>

#include "frotz.h"
#include "frotz_interface.h"

typedef struct {
  char word[10];
  unsigned char flags[8];
} zbabel_dict_word_t;

extern void get_object(zobject *obj, zword obj_num);
extern int get_num_world_objs(void);
extern int get_self_object_num(void);
extern void dumb_clear_screen(void);
extern void jericho_clear_screen(void);
extern unsigned int get_dictionary_word_count(const char *name);
extern void get_dictionary(zbabel_dict_word_t *dictionary, int dict_size);
extern void ztools_cleanup(void);

static zobject current_object;
static char *dictionary_text;
static size_t dictionary_capacity;

static int read_object(int object_num) {
  if (object_num < 1 || object_num > get_num_world_objs()) {
    return 0;
  }
  memset(&current_object, 0, sizeof(current_object));
  get_object(&current_object, (zword)object_num);
  return current_object.num == (unsigned int)object_num;
}

int zbabel_object_exists(int object_num) {
  return read_object(object_num);
}

const char *zbabel_object_name(int object_num) {
  return read_object(object_num) ? current_object.name : "";
}

int zbabel_object_parent(int object_num) {
  return read_object(object_num) ? current_object.parent : 0;
}

int zbabel_object_child(int object_num) {
  return read_object(object_num) ? current_object.child : 0;
}

int zbabel_object_sibling(int object_num) {
  return read_object(object_num) ? current_object.sibling : 0;
}

int zbabel_player_location(void) {
  return zbabel_object_parent(get_self_object_num());
}

int zbabel_inventory_first(void) {
  return zbabel_object_child(get_self_object_num());
}

void zbabel_clear_output(void) {
  dumb_clear_screen();
  jericho_clear_screen();
}

const char *zbabel_dictionary(const char *story_path) {
  unsigned int count = get_dictionary_word_count(story_path);
  zbabel_dict_word_t *words = calloc(count, sizeof(zbabel_dict_word_t));
  size_t required = (size_t)count * 11 + 1;
  size_t offset = 0;
  unsigned int index;

  if (words == NULL) {
    ztools_cleanup();
    return "";
  }
  if (required > dictionary_capacity) {
    char *resized = realloc(dictionary_text, required);
    if (resized == NULL) {
      free(words);
      ztools_cleanup();
      return "";
    }
    dictionary_text = resized;
    dictionary_capacity = required;
  }

  get_dictionary(words, count);
  for (index = 0; index < count; index++) {
    size_t length = strnlen(words[index].word, sizeof(words[index].word));
    memcpy(dictionary_text + offset, words[index].word, length);
    offset += length;
    dictionary_text[offset++] = '\n';
  }
  dictionary_text[offset] = '\0';
  free(words);
  ztools_cleanup();
  return dictionary_text;
}
