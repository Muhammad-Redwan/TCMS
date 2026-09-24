import { parse } from './list-query';

describe('list query from URL', () => {
  it('uses defaults for an empty query string', () => {
    expect(parse({}, ['status'])).toEqual({
      page: 0,
      size: 20,
      sort: undefined,
      q: undefined,
      filters: {},
    });
  });

  it('reads page, size, sort, search and known filters', () => {
    expect(
      parse(
        { page: '2', size: '50', sort: 'fullName,desc', q: 'sara', status: 'ACTIVE', other: 'x' },
        ['status', 'departmentId'],
      ),
    ).toEqual({
      page: 2,
      size: 50,
      sort: 'fullName,desc',
      q: 'sara',
      filters: { status: 'ACTIVE' },
    });
  });

  it('ignores invalid page numbers and sizes outside the allowed list', () => {
    const query = parse({ page: '-3', size: '5000' }, []);
    expect(query.page).toBe(0);
    expect(query.size).toBe(20);
  });
});
