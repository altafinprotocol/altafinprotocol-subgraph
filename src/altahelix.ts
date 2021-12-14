  import { Address, BigDecimal, BigInt, dataSource, ethereum, log } from '@graphprotocol/graph-ts'
  import { Helix, History, User } from '../generated/schema'
  import { AltaHelix as AltaHelixContract, Transfer as TransferEvent } from '../generated/AltaHelix/AltaHelix'
  import { Altafin as AltafinTokenContract } from '../generated/AltaHelix/Altafin'

  const ADDRESS_ZERO = Address.fromString('0x0000000000000000000000000000000000000000');
  const BIG_DECIMAL_ZERO = BigDecimal.fromString('0');
  const BIG_DECIMAL_1E18 = BigDecimal.fromString('1e18');
  const BIG_DECIMAL_1E6 = BigDecimal.fromString('1e6');
  const BIG_INT_ZERO = BigInt.fromI32(0);
  const ALTA_HELIX_ADDRESS = Address.fromString('0x7D1BE7F0e7cA3CcFbE25fc4153f0d1112fa44D1e');
  const ALTAFIN_TOKEN_ADDRESS = Address.fromString('0xe46f290cd59195a83e757891430d8d517d16b334');
  
  function createHelix(block: ethereum.Block): Helix {
    const contract = AltaHelixContract.bind(dataSource.address())
    const helix = new Helix(dataSource.address().toHex())
    helix.decimals = contract.decimals()
    helix.name = contract.name()
    helix.afn = contract.AFN()
    helix.symbol = contract.symbol()
    helix.totalSupply = BIG_DECIMAL_ZERO
    helix.afnStaked = BIG_DECIMAL_ZERO
    helix.afnHarvested = BIG_DECIMAL_ZERO
    helix.xAfnMinted = BIG_DECIMAL_ZERO
    helix.xAfnBurned = BIG_DECIMAL_ZERO
    helix.xAfnAge = BIG_DECIMAL_ZERO
    helix.xAfnAgeDestroyed = BIG_DECIMAL_ZERO
    helix.ratio = BIG_DECIMAL_ZERO
    helix.updatedAt = block.timestamp
    helix.save()
  
    return helix as Helix
  }
  
  function getHelix(block: ethereum.Block): Helix {
    let helix = Helix.load(dataSource.address().toHex())
  
    if (helix === null) {
        helix = createHelix(block)
    }
  
    return helix as Helix
  }
  
  function createUser(address: Address, block: ethereum.Block): User {
    const user = new User(address.toHex())
  
    // Set relation to helix
    user.helix = dataSource.address().toHex()
  
    user.xAfn = BIG_DECIMAL_ZERO
    user.xAfnMinted = BIG_DECIMAL_ZERO
    user.xAfnBurned = BIG_DECIMAL_ZERO
  
    user.afnStaked = BIG_DECIMAL_ZERO
  
    user.afnHarvested = BIG_DECIMAL_ZERO
  
    // In/Out
    user.xAfnOut = BIG_DECIMAL_ZERO
    user.afnOut = BIG_DECIMAL_ZERO
  
    user.xAfnIn = BIG_DECIMAL_ZERO
    user.afnIn = BIG_DECIMAL_ZERO
  
    user.xAfnAge = BIG_DECIMAL_ZERO
    user.xAfnAgeDestroyed = BIG_DECIMAL_ZERO
  
    user.xAfnOffset = BIG_DECIMAL_ZERO
    user.afnOffset = BIG_DECIMAL_ZERO
    user.updatedAt = block.timestamp
  
    return user as User
  }
  
  function getUser(address: Address, block: ethereum.Block): User {
    let user = User.load(address.toHex())
  
    if (user === null) {
      user = createUser(address, block)
    }
  
    return user as User
  }
  
  function getHistory(block: ethereum.Block): History {
    const day = block.timestamp.toI32() / 86400
  
    const id = BigInt.fromI32(day).toString()
  
    let history = History.load(id)
  
    if (history === null) {
      const date = day * 86400
      history = new History(id)
      history.date = date
      history.timeframe = 'Day'
      history.afnStaked = BIG_DECIMAL_ZERO
      history.afnHarvested = BIG_DECIMAL_ZERO
      history.xAfnAge = BIG_DECIMAL_ZERO
      history.xAfnAgeDestroyed = BIG_DECIMAL_ZERO
      history.xAfnMinted = BIG_DECIMAL_ZERO
      history.xAfnBurned = BIG_DECIMAL_ZERO
      history.xAfnSupply = BIG_DECIMAL_ZERO
      history.ratio = BIG_DECIMAL_ZERO
    }
  
    return history as History
  }
  
  export function transfer(event: TransferEvent): void {
    // Convert to BigDecimal with 18 places, 1e18.
    const value = event.params.value.divDecimal(BIG_DECIMAL_1E18)
  
    // If value is zero, do nothing.
    if (value.equals(BIG_DECIMAL_ZERO)) {
      log.warning('Transfer zero value! Value: {} Tx: {}', [
        event.params.value.toString(),
        event.transaction.hash.toHex(),
      ])
      return
    }
  
    const helix = getHelix(event.block)
    const helixContract = AltaHelixContract.bind(ALTA_HELIX_ADDRESS)
  
    helix.totalSupply = helixContract.totalSupply().divDecimal(BIG_DECIMAL_1E18)
    helix.afnStaked = AltafinTokenContract.bind(ALTAFIN_TOKEN_ADDRESS)
      .balanceOf(ALTA_HELIX_ADDRESS)
      .divDecimal(BIG_DECIMAL_1E18)
      helix.ratio = helix.afnStaked.div(helix.totalSupply)
  
    const what = value.times(helix.ratio)
  
    // Minted xAFN
    if (event.params.from == ADDRESS_ZERO) {
      const user = getUser(event.params.to, event.block)
  
      log.info('{} minted {} xAFN in exchange for {} AFN - afnStaked before {} afnStaked after {}', [
        event.params.to.toHex(),
        value.toString(),
        what.toString(),
        user.afnStaked.toString(),
        user.afnStaked.plus(what).toString(),
      ])
  
      if (user.xAfn == BIG_DECIMAL_ZERO) {
        log.info('{} entered the helix', [user.id])
        user.helix = helix.id
      }
  
      user.xAfnMinted = user.xAfnMinted.plus(value)
  
  
      user.afnStaked = user.afnStaked.plus(what)
  
      const days = event.block.timestamp.minus(user.updatedAt).divDecimal(BigDecimal.fromString('86400'))
  
      const xAfnAge = days.times(user.xAfn)
  
      user.xAfnAge = user.xAfnAge.plus(xAfnAge)
  
      // Update last
      user.xAfn = user.xAfn.plus(value)
  
      user.updatedAt = event.block.timestamp
  
      user.save()
  
      const helixDays = event.block.timestamp.minus(helix.updatedAt).divDecimal(BigDecimal.fromString('86400'))
      const helixXAfn = helix.xAfnMinted.minus(helix.xAfnBurned)
      helix.xAfnMinted = helix.xAfnMinted.plus(value)
      helix.xAfnAge = helix.xAfnAge.plus(helixDays.times(helixXAfn))
      helix.afnStaked = helix.afnStaked.plus(what)
      helix.updatedAt = event.block.timestamp
  
      const history = getHistory(event.block)
      history.xAfnAge = helix.xAfnAge
      history.xAfnMinted = history.xAfnMinted.plus(value)
      history.xAfnSupply = helix.totalSupply
      history.afnStaked = history.afnStaked.plus(what)
      history.ratio = helix.ratio
      history.save()
    }
  
    // Burned xAfn
    if (event.params.to == ADDRESS_ZERO) {
      log.info('{} burned {} xAfn', [event.params.from.toHex(), value.toString()])
  
      const user = getUser(event.params.from, event.block)
  
      user.xAfnBurned = user.xAfnBurned.plus(value)
  
      user.afnHarvested = user.afnHarvested.plus(what)
  
      const days = event.block.timestamp.minus(user.updatedAt).divDecimal(BigDecimal.fromString('86400'))
  
      const xAfnAge = days.times(user.xAfn)
  
      user.xAfnAge = user.xAfnAge.plus(xAfnAge)
  
      const xAfnAgeDestroyed = user.xAfnAge.div(user.xAfn).times(value)
  
      user.xAfnAgeDestroyed = user.xAfnAgeDestroyed.plus(xAfnAgeDestroyed)
  
      // remove xAfnAge
      user.xAfnAge = user.xAfnAge.minus(xAfnAgeDestroyed)
      // Update xAfn last
      user.xAfn = user.xAfn.minus(value)
  
      if (user.xAfn == BIG_DECIMAL_ZERO) {
        log.info('{} left the helix', [user.id])
        user.helix = null
      }
  
      user.updatedAt = event.block.timestamp
  
      user.save()
  
      const helixDays = event.block.timestamp.minus(helix.updatedAt).divDecimal(BigDecimal.fromString('86400'))
      const helixXAfn = helix.xAfnMinted.minus(helix.xAfnBurned)
      helix.xAfnBurned = helix.xAfnBurned.plus(value)
      helix.xAfnAge = helix.xAfnAge.plus(helixDays.times(helixXAfn)).minus(xAfnAgeDestroyed)
      helix.xAfnAgeDestroyed = helix.xAfnAgeDestroyed.plus(xAfnAgeDestroyed)
      helix.afnHarvested = helix.afnHarvested.plus(what)
      helix.updatedAt = event.block.timestamp
  
      const history = getHistory(event.block)
      history.xAfnSupply = helix.totalSupply
      history.xAfnBurned = history.xAfnBurned.plus(value)
      history.xAfnAge = helix.xAfnAge
      history.xAfnAgeDestroyed = history.xAfnAgeDestroyed.plus(xAfnAgeDestroyed)
      history.afnHarvested = history.afnHarvested.plus(what)
      history.ratio = helix.ratio
      history.save()
    }
  
    // If transfer from address to address and not known xAfn pools.
    if (event.params.from != ADDRESS_ZERO && event.params.to != ADDRESS_ZERO) {
      log.info('transfered {} xAfn from {} to {}', [
        value.toString(),
        event.params.from.toHex(),
        event.params.to.toHex(),
      ])
  
      const fromUser = getUser(event.params.from, event.block)
  
      const fromUserDays = event.block.timestamp.minus(fromUser.updatedAt).divDecimal(BigDecimal.fromString('86400'))
  
      // Recalc xAfn age first
      fromUser.xAfnAge = fromUser.xAfnAge.plus(fromUserDays.times(fromUser.xAfn))
      // Calculate xAfnAge being transfered
      const xAfnAgeTranfered = fromUser.xAfnAge.div(fromUser.xAfn).times(value)
      // Subtract from xAfnAge
      fromUser.xAfnAge = fromUser.xAfnAge.minus(xAfnAgeTranfered)
      fromUser.updatedAt = event.block.timestamp
  
      fromUser.xAfn = fromUser.xAfn.minus(value)
      fromUser.xAfnOut = fromUser.xAfnOut.plus(value)
      fromUser.afnOut = fromUser.afnOut.plus(what)
  
      if (fromUser.xAfn == BIG_DECIMAL_ZERO) {
        log.info('{} left the helix by transfer OUT', [fromUser.id])
        fromUser.helix = null
      }
  
      fromUser.save()
  
      const toUser = getUser(event.params.to, event.block)
  
      if (toUser.helix === null) {
        log.info('{} entered the helix by transfer IN', [fromUser.id])
        toUser.helix = helix.id
      }
  
      // Recalculate xAfn age and add incoming xAfnAgeTransfered
      const toUserDays = event.block.timestamp.minus(toUser.updatedAt).divDecimal(BigDecimal.fromString('86400'))
  
      toUser.xAfnAge = toUser.xAfnAge.plus(toUserDays.times(toUser.xAfn)).plus(xAfnAgeTranfered)
      toUser.updatedAt = event.block.timestamp
  
      toUser.xAfn = toUser.xAfn.plus(value)
      toUser.xAfnIn = toUser.xAfnIn.plus(value)
      toUser.afnIn = toUser.afnIn.plus(what)
  
      const difference = toUser.xAfnIn.minus(toUser.xAfnOut).minus(toUser.xAfnOffset)
  
      // If difference of afn in - afn out - offset > 0, then add on the difference
      // in staked afn based on xAfn:afn ratio at time of reciept.
      if (difference.gt(BIG_DECIMAL_ZERO)) {
        const afn = toUser.afnIn.minus(toUser.afnOut).minus(toUser.afnOffset)
  
        log.info('{} recieved a transfer of {} xAfn from {}, afn value of transfer is {}', [
          toUser.id,
          value.toString(),
          fromUser.id,
          what.toString(),
        ])
  
        toUser.afnStaked = toUser.afnStaked.plus(afn)
  
        toUser.xAfnOffset = toUser.xAfnOffset.plus(difference)
        toUser.afnOffset = toUser.afnOffset.plus(afn)
      }
  
      toUser.save()
    }
  
    helix.save()
  }