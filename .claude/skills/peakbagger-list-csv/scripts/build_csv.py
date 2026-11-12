"""Write a list's CSV and its entry in the manifest, frontend/src/coordinate-lists/lists.json.

The CSV is named for the list's id and holds rows only, in the page's order:
    Lat, Lon, Name
The name carries no list number, because Bluebird Forecast ranks the rows and numbers them
itself, and no elevation, because the app reads each summit's elevation from OpenStreetMap
(issue #207) and a second figure would only disagree with the one on screen.
"""
import json
import os

MANIFEST = 'lists.json'
SITE = 'peakbagger.com'


def rows(roster, coords):
    return [
        '{:.6f}, {:.6f}, {}'.format(*coords[peak['pid']], peak['name'])
        for peak in roster['peaks']
    ]


def write_csv(directory, list_id, roster, coords):
    path = os.path.join(directory, f'{list_id}.csv')
    with open(path, 'w', encoding='utf-8') as out:
        out.write('\n'.join(rows(roster, coords)) + '\n')
    return path


def entry(item, peaks, crawled):
    """The manifest entry for one list of the spec. `peaks` is the CSV's row count."""
    return {
        'id': item['id'],
        'name': item['name'],
        'description': item['description'],
        'region': item['region'],
        'file': f'{item["id"]}.csv',
        'peaks': peaks,
        'source': {
            'site': SITE,
            'listId': str(item['lid']),
            'url': f'https://www.{SITE}/list.aspx?lid={item["lid"]}',
        },
        'credit': item['credit'],
        'crawled': crawled,
    }


def read_manifest(directory):
    return json.load(open(os.path.join(directory, MANIFEST), encoding='utf-8'))


def upsert(manifest, new):
    """Replace the entry with this id where it stands, or add it after the others."""
    for index, old in enumerate(manifest['lists']):
        if old['id'] == new['id']:
            manifest['lists'][index] = new
            return
    manifest['lists'].append(new)


def write_manifest(directory, manifest):
    # A region stays on one line, the way the file has always read; the lists are indented.
    def text(value):
        return json.dumps(value, ensure_ascii=False)

    def region(value):
        places = value.get('places')
        parent = value.get('parent')
        return (
            '{ "name": ' + text(value['name'])
            + (', "parent": ' + text(parent) if parent else '')
            + (', "places": ' + text(places) if places else '')
            + ' }'
        )

    lists = json.dumps(manifest['lists'], indent=2, ensure_ascii=False).replace('\n', '\n  ')
    body = (
        '{\n'
        f'  "$schema": {text(manifest["$schema"])},\n'
        '  "regions": [\n'
        + ',\n'.join('    ' + region(value) for value in manifest['regions'])
        + '\n  ],\n'
        f'  "lists": {lists}\n'
        '}\n'
    )
    with open(os.path.join(directory, MANIFEST), 'w', encoding='utf-8') as out:
        out.write(body)
