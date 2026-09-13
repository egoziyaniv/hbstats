jest.mock('@/lib/prisma', () => ({__esModule:true, default:{ $transaction: jest.fn(), game:{findUnique:jest.fn(),update:jest.fn(),delete:jest.fn()} }}));
jest.mock('@/lib/auth', () => ({getRequestUser:jest.fn().mockResolvedValue({role:'ADMIN'})}));
jest.mock('@/lib/standings-from-games', () => ({recomputeStoredStandings:jest.fn()}));
import { PUT, DELETE } from '../route';
import prisma from '@/lib/prisma';
import { recomputeStoredStandings } from '@/lib/standings-from-games';
import { NextRequest } from 'next/server';
const oldGame={id:'g', seasonId:'s', competitionId:'c', status:'COMPLETED',homeTeamId:'A',awayTeamId:'B',homeScore:2,awayScore:0};
beforeEach(()=>{jest.clearAllMocks(); (prisma.$transaction as jest.Mock).mockImplementation(fn=>fn(prisma)); (prisma.game.findUnique as jest.Mock).mockResolvedValue(oldGame);});
it('recomputes source and destination when moving a completed game',async()=>{
 (prisma.game.update as jest.Mock).mockResolvedValue({...oldGame,seasonId:'next'});
 const res=await PUT(new NextRequest('http://localhost/api/games',{method:'PUT',body:JSON.stringify({id:'g',seasonId:'next'})}));
 expect(res.status).toBe(200);
 expect(recomputeStoredStandings).toHaveBeenCalledWith(prisma,'s','c',oldGame);
 expect(recomputeStoredStandings).toHaveBeenCalledWith(prisma,'next','c',oldGame);
});
it('recomputes the previous scope after deletion inside the same transaction',async()=>{
 const res=await DELETE(new NextRequest('http://localhost/api/games?id=g',{method:'DELETE'}));
 expect(res.status).toBe(200);
 expect(prisma.$transaction).toHaveBeenCalled();
 expect(recomputeStoredStandings).toHaveBeenCalledWith(prisma,'s','c',oldGame);
});
