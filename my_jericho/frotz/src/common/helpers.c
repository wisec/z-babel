/* --- INIZIO CODICE DA AGGIUNGERE A text.c --- */

#include "frotz.h" // Assicura che gli header necessari siano presenti

// Prototipi per le funzioni che useremo da objects.c
// Questo dice a text.c che queste funzioni esistono, anche se sono in un altro file.
extern zword get_parent(zword object);
extern zword get_child(zword object);
extern zword get_sibling(zword object);
extern void z_print_object(zword object); // La funzione per stampare i nomi

void print_objects_in_current_room(void) {
    zword room_id;
    zword current_object_id;

    // 1. Ottieni la stanza attuale usando la funzione che hai trovato!
    //    L'oggetto #1 è sempre il giocatore.
    room_id = get_parent(1);

    // 2. Ottieni il primo oggetto nella stanza.
    current_object_id = get_child(room_id);

    // Se la stanza è vuota, non fare nulla.
    if (current_object_id == 0) {
        return;
    }

    // Stampa un'intestazione per riconoscere il nostro output.
    os_display_string("\n[Oggetti Rilevati]:\n");

    // 3. Inizia il ciclo attraverso i "fratelli" (siblings).
    while (current_object_id != 0) {
        // Non stampare il giocatore stesso.
        if (current_object_id != 1) {
            os_display_string("  - ");
            // Usa la funzione di Frotz per stampare il nome dell'oggetto.
            z_print_object(current_object_id);
            os_new_line();
        }

        // Passa all'oggetto successivo.
        current_object_id = get_sibling(current_object_id);
    }
}
/* --- FINE CODICE DA AGGIUNGERE A text.c --- */
