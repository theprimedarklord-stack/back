import { AllExceptionsFilter } from './http-exception.filter';
import { HttpException, HttpStatus, BadRequestException, NotFoundException } from '@nestjs/common';

function createMockHost(responseMock: any) {
  return {
    switchToHttp: () => ({
      getResponse: () => responseMock,
      getRequest: () => ({}),
    }),
  };
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockResponse: any;

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('повертає 400 з деталями валідації при BadRequestException', () => {
    const exception = new BadRequestException({
      message: ['email must be an email', 'password is too short'],
    });

    filter.catch(exception, createMockHost(mockResponse) as any);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        status: 400,
        error: ['email must be an email', 'password is too short'],
      })
    );
  });

  it('повертає 404 при NotFoundException', () => {
    const exception = new NotFoundException('Resource not found');

    filter.catch(exception, createMockHost(mockResponse) as any);

    expect(mockResponse.status).toHaveBeenCalledWith(404);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, status: 404 })
    );
  });

  it('повертає 500 при невідомій помилці (Error)', () => {
    const exception = new Error('Unexpected crash');

    filter.catch(exception, createMockHost(mockResponse) as any);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, status: 500 })
    );
  });

  it('відповідь завжди містить timestamp', () => {
    filter.catch(new Error('test'), createMockHost(mockResponse) as any);

    const call = mockResponse.json.mock.calls[0][0];
    expect(call.timestamp).toBeTruthy();
    expect(new Date(call.timestamp).getTime()).not.toBeNaN();
  });

  it('повертає 429 при rate limit HttpException', () => {
    const exception = new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);

    filter.catch(exception, createMockHost(mockResponse) as any);

    expect(mockResponse.status).toHaveBeenCalledWith(429);
  });
});