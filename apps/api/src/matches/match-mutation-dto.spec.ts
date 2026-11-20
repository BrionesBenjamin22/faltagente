import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CancelMatchDto, UpdateMatchDto } from './dto/match-update.dto.js';

const options = { whitelist: true, forbidNonWhitelisted: true };

describe('match mutation DTO security boundaries', () => {
  it('accepts omitted fields and only permits explicit clearing of description and format', async () => {
    expect(await validate(plainToInstance(UpdateMatchDto, { expectedVersion: 1 }), options)).toEqual([]);
    expect(await validate(plainToInstance(UpdateMatchDto, {
      expectedVersion: 1, description: null, sportFormatId: null,
    }), options)).toEqual([]);
    for (const field of ['sportId', 'locationId', 'startsAt', 'placeName', 'address', 'pricePerPerson', 'totalPlaces']) {
      const errors = await validate(plainToInstance(UpdateMatchDto, { expectedVersion: 1, [field]: null }), options);
      expect(errors.map(error => error.property)).toContain(field);
    }
  });

  it('rejects mass assignment of ownership, state, availability and audit fields', async () => {
    const forbidden = ['organizerId', 'userId', 'status', 'availablePlaces', 'version', 'createdAt', 'updatedAt', 'cancelledAt', 'cancellationReason'];
    for (const Type of [UpdateMatchDto, CancelMatchDto]) {
      const dto = plainToInstance(Type, Object.fromEntries([
        ['expectedVersion', 1], ...forbidden.map(field => [field, 'injected']),
      ]));
      const errors = await validate(dto, options);
      expect(errors.map(error => error.property)).toEqual(expect.arrayContaining(forbidden));
    }
  });

  it('requires a positive integer version without coercing client strings', async () => {
    for (const expectedVersion of [undefined, null, '1', 0, -1, 1.5, 2147483648]) {
      for (const Type of [UpdateMatchDto, CancelMatchDto]) {
        const errors = await validate(plainToInstance(Type, { expectedVersion }), options);
        expect(errors.map(error => error.property)).toContain('expectedVersion');
      }
    }
  });

  it('trims text and rejects oversized or non-text cancellation reasons', async () => {
    const update = plainToInstance(UpdateMatchDto, { expectedVersion: 1, description: '  Información  ', placeName: '  Cancha  ' });
    expect(update.description).toBe('Información');
    expect(update.placeName).toBe('Cancha');
    const cancel = plainToInstance(CancelMatchDto, { expectedVersion: 1, reason: '  Motivo  ' });
    expect(cancel.reason).toBe('Motivo');
    expect(await validate(cancel, options)).toEqual([]);
    expect(await validate(plainToInstance(CancelMatchDto, { expectedVersion: 1, reason: '  ' }), options)).toEqual([]);
    for (const reason of [null, 2, {}, 'a'.repeat(501)]) {
      const errors = await validate(plainToInstance(CancelMatchDto, { expectedVersion: 1, reason }), options);
      expect(errors.map(error => error.property)).toContain('reason');
    }
  });
});
